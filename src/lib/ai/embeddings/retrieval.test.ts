import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  embedTextMock: vi.fn(),
  executeMock: vi.fn(),
  canAccessMock: vi.fn(),
}));

vi.mock("./index", () => ({
  embedText: h.embedTextMock,
  EMBEDDING_MODEL: "openai/text-embedding-3-small",
  EMBEDDING_DIMENSION: 1536,
}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { execute: h.executeMock },
}));

vi.mock("lib/visibility", () => ({
  canAccess: h.canAccessMock,
}));

import {
  type CandidateRow,
  RRF_K,
  buildRagPayload,
  fuseCandidates,
  hybridRetrieve,
  retrieveForChat,
} from "./retrieval";

const NOW = new Date("2026-06-10T00:00:00Z");

function row(
  sourceRef: string,
  chunkIndex: number,
  overrides: Partial<CandidateRow> = {},
): CandidateRow {
  return {
    collection_id: "col-1",
    source_ref: sourceRef,
    chunk_index: chunkIndex,
    chunk_text: `text of ${sourceRef}#${chunkIndex}`,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("fuseCandidates — reciprocal rank fusion", () => {
  it("uses k=60", () => {
    expect(RRF_K).toBe(60);
  });

  it("ranks a chunk present in BOTH lists above a vector-only chunk ranked higher", () => {
    const both = row("both.md", 0);
    const vectorOnly = row("vector-only.md", 0);
    // vectorOnly is rank 1 in the vector list, but `both` also appears rank 1
    // in FTS: 1/62 + 1/61 > 1/61.
    const fused = fuseCandidates([vectorOnly, both], [both], { now: NOW });
    expect(fused[0].sourceRef).toBe("both.md");
    expect(fused[1].sourceRef).toBe("vector-only.md");
  });

  it("dedupes a chunk appearing in both lists (single entry, summed score)", () => {
    const shared = row("shared.md", 3);
    const fused = fuseCandidates([shared], [shared], { now: NOW });
    expect(fused).toHaveLength(1);
    expect(fused[0].chunkIndex).toBe(3);
  });

  it("falls back to pure vector ordering when FTS returns nothing", () => {
    const a = row("a.md", 0);
    const b = row("b.md", 0);
    const c = row("c.md", 0);
    const fused = fuseCandidates([a, b, c], [], { now: NOW });
    expect(fused.map((f) => f.sourceRef)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("returns empty for two empty lists", () => {
    expect(fuseCandidates([], [], { now: NOW })).toEqual([]);
  });

  it("normalizes scores so the best chunk scores exactly 1", () => {
    const a = row("a.md", 0);
    const b = row("b.md", 0);
    const fused = fuseCandidates([a, b], [a], { now: NOW });
    expect(fused[0].score).toBe(1);
    expect(fused[1].score).toBeGreaterThan(0);
    expect(fused[1].score).toBeLessThan(1);
  });

  it("boosts recent chunks over old ones with identical RRF scores", () => {
    const fresh = row("fresh.md", 0, { created_at: NOW.toISOString() });
    const stale = row("stale.md", 0, {
      created_at: new Date("2024-01-01T00:00:00Z").toISOString(),
    });
    // Same rank (1) in different lists → identical RRF contribution; the
    // recency boost must break the tie in favor of the fresh chunk.
    const fused = fuseCandidates([stale], [fresh], { now: NOW });
    expect(fused[0].sourceRef).toBe("fresh.md");
  });

  it("keeps the recency boost small (≤10%) — cannot overcome a large rank gap", () => {
    const stale = row("stale.md", 0, {
      created_at: new Date("2020-01-01T00:00:00Z").toISOString(),
    });
    const filler = Array.from({ length: 8 }, (_, i) =>
      row(`filler${i}.md`, i, {
        created_at: new Date("2020-01-01T00:00:00Z").toISOString(),
      }),
    );
    const fresh = row("fresh.md", 0, { created_at: NOW.toISOString() });
    // stale at rank 1 (1/61) vs fresh at rank 10 (1.1 × 1/70 ≈ 0.0157):
    // a ≤10% boost must not let a deep result jump the list.
    const fused = fuseCandidates([stale, ...filler, fresh], [], { now: NOW });
    expect(fused[0].sourceRef).toBe("stale.md");
  });

  it("tolerates null created_at (no boost, no crash)", () => {
    const noDate = row("nodate.md", 0, { created_at: null });
    const fused = fuseCandidates([noDate], [], { now: NOW });
    expect(fused).toHaveLength(1);
    expect(fused[0].score).toBe(1);
  });

  it("respects topK", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`r${i}.md`, i));
    const fused = fuseCandidates(rows, [], { topK: 4, now: NOW });
    expect(fused).toHaveLength(4);
  });
});

describe("buildRagPayload — citation-first payload", () => {
  it("returns null for no chunks", () => {
    expect(buildRagPayload([], {})).toBeNull();
  });

  it("assigns one stable [Source N] per (collection, sourceRef) shared by prompt and list", () => {
    const payload = buildRagPayload(
      [
        {
          collectionId: "col-1",
          sourceRef: "handbook.pdf",
          chunkIndex: 0,
          chunkText: "alpha",
          score: 1,
        },
        {
          collectionId: "col-1",
          sourceRef: "policy.md",
          chunkIndex: 2,
          chunkText: "beta",
          score: 0.8,
        },
        {
          collectionId: "col-1",
          sourceRef: "handbook.pdf",
          chunkIndex: 5,
          chunkText: "gamma",
          score: 0.6,
        },
      ],
      { "col-1": "HR Docs" },
    );
    expect(payload).not.toBeNull();
    // Two deduped sources, numbered by first appearance.
    expect(payload!.sources).toHaveLength(2);
    expect(payload!.sources[0]).toMatchObject({
      index: 1,
      sourceRef: "handbook.pdf",
      collectionName: "HR Docs",
      score: 1,
    });
    expect(payload!.sources[1]).toMatchObject({
      index: 2,
      sourceRef: "policy.md",
    });
    // Prompt block reuses the same numbers — both handbook chunks are Source 1.
    expect(payload!.context).toContain("[Source 1: handbook.pdf]\nalpha");
    expect(payload!.context).toContain("[Source 2: policy.md]\nbeta");
    expect(payload!.context).toContain("[Source 1: handbook.pdf]\ngamma");
    expect(payload!.context).not.toContain("[Source 3");
  });

  it("keeps the max chunk score per deduped source", () => {
    const payload = buildRagPayload(
      [
        {
          collectionId: "col-1",
          sourceRef: "a.md",
          chunkIndex: 0,
          chunkText: "x",
          score: 0.4,
        },
        {
          collectionId: "col-1",
          sourceRef: "a.md",
          chunkIndex: 1,
          chunkText: "y",
          score: 0.9,
        },
      ],
      {},
    );
    expect(payload!.sources[0].score).toBe(0.9);
  });

  it("falls back to a generic collection name when unknown", () => {
    const payload = buildRagPayload(
      [
        {
          collectionId: "col-x",
          sourceRef: "a.md",
          chunkIndex: 0,
          chunkText: "x",
          score: 1,
        },
      ],
      {},
    );
    expect(payload!.sources[0].collectionName).toBe("Knowledge base");
  });

  it("treats the same sourceRef in different collections as distinct sources", () => {
    const payload = buildRagPayload(
      [
        {
          collectionId: "col-1",
          sourceRef: "readme.md",
          chunkIndex: 0,
          chunkText: "x",
          score: 1,
        },
        {
          collectionId: "col-2",
          sourceRef: "readme.md",
          chunkIndex: 0,
          chunkText: "y",
          score: 0.5,
        },
      ],
      { "col-1": "One", "col-2": "Two" },
    );
    expect(payload!.sources).toHaveLength(2);
    expect(payload!.sources.map((s) => s.collectionName)).toEqual([
      "One",
      "Two",
    ]);
  });
});

describe("hybridRetrieve — db orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it("returns [] without touching embed/db when no collections given", async () => {
    const result = await hybridRetrieve("query", []);
    expect(result).toEqual([]);
    expect(h.embedTextMock).not.toHaveBeenCalled();
    expect(h.executeMock).not.toHaveBeenCalled();
  });

  it("fuses vector and FTS rows (chunk in both lists wins)", async () => {
    const both = row("both.md", 0);
    const vecTop = row("vec.md", 0);
    h.executeMock
      .mockResolvedValueOnce({ rows: [vecTop, both] }) // vector
      .mockResolvedValueOnce({ rows: [both] }); // fts
    const result = await hybridRetrieve("safety barriers", ["col-1"]);
    expect(h.executeMock).toHaveBeenCalledTimes(2);
    expect(result[0].sourceRef).toBe("both.md");
    expect(result).toHaveLength(2);
  });

  it("falls back to pure vector results when the FTS query fails", async () => {
    const a = row("a.md", 0);
    const b = row("b.md", 1);
    h.executeMock
      .mockResolvedValueOnce({ rows: [a, b] }) // vector
      .mockRejectedValueOnce(new Error("fts exploded")); // fts
    const result = await hybridRetrieve("query", ["col-1"]);
    expect(result.map((r) => r.sourceRef)).toEqual(["a.md", "b.md"]);
  });

  it("falls back to pure vector ordering when FTS matches nothing", async () => {
    const a = row("a.md", 0);
    const b = row("b.md", 1);
    h.executeMock
      .mockResolvedValueOnce({ rows: [a, b] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await hybridRetrieve("query", ["col-1"]);
    expect(result.map((r) => r.sourceRef)).toEqual(["a.md", "b.md"]);
    expect(result[0].score).toBe(1);
  });

  it("embeds the query exactly once", async () => {
    h.executeMock.mockResolvedValue({ rows: [] });
    await hybridRetrieve("query", ["col-1", "col-2"]);
    expect(h.embedTextMock).toHaveBeenCalledTimes(1);
    expect(h.embedTextMock).toHaveBeenCalledWith("query", undefined);
  });

  it("threads the billing attribution through to embedText", async () => {
    h.executeMock.mockResolvedValue({ rows: [] });
    await hybridRetrieve("query", ["col-1"], 6, {
      userId: "u1",
      teamId: "team-1",
    });
    expect(h.embedTextMock).toHaveBeenCalledWith("query", {
      userId: "u1",
      teamId: "team-1",
    });
  });
});

describe("retrieveForChat — access-filtered entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.embedTextMock.mockResolvedValue([0.1, 0.2]);
  });

  it("returns null and never queries when the user can access no collection", async () => {
    h.canAccessMock.mockResolvedValue(false);
    const result = await retrieveForChat("query", ["col-1", "col-2"], "u1");
    expect(result).toBeNull();
    expect(h.canAccessMock).toHaveBeenCalledTimes(2);
    expect(h.executeMock).not.toHaveBeenCalled();
  });

  it("checks access with entityType knowledge_collection and capability use", async () => {
    h.canAccessMock.mockResolvedValue(false);
    await retrieveForChat("query", ["col-1"], "u1");
    expect(h.canAccessMock).toHaveBeenCalledWith(
      "knowledge_collection",
      "col-1",
      "u1",
      "use",
    );
  });

  it("dedupes repeated collection ids before checking access", async () => {
    h.canAccessMock.mockResolvedValue(false);
    await retrieveForChat("query", ["col-1", "col-1", "col-1"], "u1");
    expect(h.canAccessMock).toHaveBeenCalledTimes(1);
  });

  it("treats canAccess rejections as denied (fail closed)", async () => {
    h.canAccessMock.mockRejectedValue(new Error("db down"));
    const result = await retrieveForChat("query", ["col-1"], "u1");
    expect(result).toBeNull();
    expect(h.executeMock).not.toHaveBeenCalled();
  });

  it("retrieves and builds the payload for accessible collections only", async () => {
    h.canAccessMock.mockImplementation(
      (_t: string, id: string) => Promise.resolve(id === "col-ok"),
    );
    const chunk = row("doc.md", 0, { collection_id: "col-ok" });
    h.executeMock
      .mockResolvedValueOnce({ rows: [chunk] }) // vector
      .mockResolvedValueOnce({ rows: [chunk] }) // fts
      .mockResolvedValueOnce({ rows: [{ id: "col-ok", name: "Ops Docs" }] }); // names
    const result = await retrieveForChat(
      "query",
      ["col-ok", "col-denied"],
      "u1",
    );
    expect(result).not.toBeNull();
    expect(result!.sources).toEqual([
      {
        index: 1,
        sourceRef: "doc.md",
        collectionId: "col-ok",
        collectionName: "Ops Docs",
        score: 1,
      },
    ]);
    expect(result!.context).toContain("[Source 1: doc.md]");
  });

  it("returns null when retrieval yields no chunks", async () => {
    h.canAccessMock.mockResolvedValue(true);
    h.executeMock.mockResolvedValue({ rows: [] });
    const result = await retrieveForChat("query", ["col-1"], "u1");
    expect(result).toBeNull();
  });

  it("attributes the query embedding to the acting user and team", async () => {
    h.canAccessMock.mockResolvedValue(true);
    h.executeMock.mockResolvedValue({ rows: [] });
    await retrieveForChat("query", ["col-1"], "u1", 6, "team-9");
    expect(h.embedTextMock).toHaveBeenCalledWith("query", {
      userId: "u1",
      teamId: "team-9",
    });
  });

  it("defaults attribution teamId to null when no team is given", async () => {
    h.canAccessMock.mockResolvedValue(true);
    h.executeMock.mockResolvedValue({ rows: [] });
    await retrieveForChat("query", ["col-1"], "u1");
    expect(h.embedTextMock).toHaveBeenCalledWith("query", {
      userId: "u1",
      teamId: null,
    });
  });
});
