import type { UserMemoryEntity } from "lib/db/pg/schema.pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listActiveMock: vi.fn(),
  bumpLastUsedMock: vi.fn(),
  embedTextMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/embeddings", () => ({ embedText: h.embedTextMock }));
vi.mock("./store", () => ({
  listActiveMemories: h.listActiveMock,
  bumpLastUsed: h.bumpLastUsedMock,
}));

import {
  MEMORY_PROMPT_CHAR_BUDGET,
  buildMemoryPromptBlock,
  cosineSimilarity,
  formatMemoryBlock,
  rankMemories,
} from "./inject";

function memory(partial: Partial<UserMemoryEntity>): UserMemoryEntity {
  return {
    id: "m0",
    userId: "u1",
    scopeId: null,
    kind: "preference",
    content: "a fact",
    embedding: null,
    sourceThreadId: null,
    confidence: 0.5,
    supersededBy: null,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listActiveMock.mockResolvedValue([]);
  h.bumpLastUsedMock.mockResolvedValue(undefined);
  h.embedTextMock.mockResolvedValue([1, 0]);
});

describe("cosineSimilarity", () => {
  it("is 1 for identical, 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 for mismatched or zero vectors", () => {
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("rankMemories", () => {
  it("ranks a query-similar memory above a dissimilar one of the same age", () => {
    const now = new Date();
    const similar = memory({ id: "sim", embedding: [1, 0] });
    const dissimilar = memory({ id: "dis", embedding: [0, 1] });
    const ranked = rankMemories([dissimilar, similar], [1, 0], now);
    expect(ranked[0].memory.id).toBe("sim");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("ranks recently used above stale when relevance is neutral", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    const old = memory({
      id: "old",
      createdAt: new Date("2026-01-01"),
      lastUsedAt: new Date("2026-01-01"),
    });
    const fresh = memory({
      id: "fresh",
      createdAt: new Date("2026-06-09"),
      lastUsedAt: new Date("2026-06-09"),
    });
    const ranked = rankMemories([old, fresh], null, now);
    expect(ranked[0].memory.id).toBe("fresh");
  });
});

describe("formatMemoryBlock (token budget + formatting)", () => {
  it("returns null for an empty list", () => {
    expect(formatMemoryBlock([])).toBeNull();
  });

  it("formats kind-tagged lines inside a <user_memory> envelope", () => {
    const result = formatMemoryBlock([
      {
        memory: memory({ id: "a", kind: "decision", content: "Chose X" }),
        score: 1,
      },
    ]);
    expect(result?.block).toContain("<user_memory>");
    expect(result?.block).toContain("</user_memory>");
    expect(result?.block).toContain("- [decision] Chose X");
    expect(result?.includedIds).toEqual(["a"]);
  });

  it("stops adding lines beyond the ~800-token char budget", () => {
    const long = "x".repeat(290);
    const ranked = Array.from({ length: 50 }, (_, i) => ({
      memory: memory({ id: `m${i}`, content: `${i} ${long}` }),
      score: 1 - i / 100,
    }));
    const result = formatMemoryBlock(ranked);
    expect(result).not.toBeNull();
    expect(result!.block.length).toBeLessThanOrEqual(
      MEMORY_PROMPT_CHAR_BUDGET + 400, // header/footer allowance
    );
    expect(result!.includedIds.length).toBeLessThan(50);
    // highest-ranked first
    expect(result!.includedIds[0]).toBe("m0");
  });

  it("always includes at least the top memory even if oversized", () => {
    const result = formatMemoryBlock([
      { memory: memory({ id: "big", content: "y".repeat(5000) }), score: 1 },
    ]);
    expect(result?.includedIds).toEqual(["big"]);
  });
});

describe("buildMemoryPromptBlock", () => {
  it("returns null when the user has no active memories", async () => {
    expect(await buildMemoryPromptBlock("u1", "hello")).toBeNull();
    expect(h.embedTextMock).not.toHaveBeenCalled();
  });

  it("builds the block and bumps lastUsedAt for included rows", async () => {
    h.listActiveMock.mockResolvedValue([
      memory({ id: "a", content: "Prefers Spanish", embedding: [1, 0] }),
    ]);
    const block = await buildMemoryPromptBlock("u1", "hola");
    expect(block).toContain("- [preference] Prefers Spanish");
    expect(h.bumpLastUsedMock).toHaveBeenCalledWith(["a"]);
  });

  it("skips query embedding when no stored memory has one", async () => {
    h.listActiveMock.mockResolvedValue([
      memory({ id: "a", content: "Prefers Spanish", embedding: null }),
    ]);
    const block = await buildMemoryPromptBlock("u1", "hola");
    expect(block).toContain("Prefers Spanish");
    expect(h.embedTextMock).not.toHaveBeenCalled();
  });

  it("still injects when the query embedder fails (best-effort)", async () => {
    h.embedTextMock.mockRejectedValue(new Error("down"));
    h.listActiveMock.mockResolvedValue([
      memory({ id: "a", content: "Prefers Spanish", embedding: [1, 0] }),
    ]);
    const block = await buildMemoryPromptBlock("u1", "hola");
    expect(block).toContain("Prefers Spanish");
  });
});
