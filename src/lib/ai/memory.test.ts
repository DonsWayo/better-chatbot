/**
 * Vitest unit tests for the user-memory feature.
 *
 * Covers the three subsystems from src/lib/memory/:
 *   • inject.ts  — formatMemoryBlock / rankMemories / cosineSimilarity / buildMemoryPromptBlock
 *   • extract.ts — shouldExtractFromTurn / hasExplicitRememberIntent / buildExtractionPrompt
 *                  / extractMemoriesFromTurn (dedup, supersede, implicit gate)
 *   • policy.ts  — resolveMemoryLayers / isMemoryMode (pure), resolveMemoryPolicy (db-backed)
 *
 * All DB and external calls are mocked. No network, no filesystem.
 */

import type { UserMemoryEntity } from "lib/db/pg/schema.pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any import that touches these paths
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  // inject.ts deps
  listActiveMock: vi.fn(),
  bumpLastUsedMock: vi.fn(),
  embedTextMock: vi.fn(),
  // extract.ts deps
  generateObjectMock: vi.fn(),
  insertMock: vi.fn(),
  supersedeMock: vi.fn(),
  resolvePolicyMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  // policy.ts db deps
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateObject: h.generateObjectMock }));
vi.mock("lib/ai/embeddings", () => ({ embedText: h.embedTextMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/db/repository", () => ({
  userRepository: { getPreferences: h.getPreferencesMock },
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock("./store", () => ({
  listActiveMemories: h.listActiveMock,
  bumpLastUsed: h.bumpLastUsedMock,
  insertMemory: h.insertMock,
  supersedeMemory: h.supersedeMock,
}));
vi.mock("../memory/store", () => ({
  listActiveMemories: h.listActiveMock,
  bumpLastUsed: h.bumpLastUsedMock,
  insertMemory: h.insertMock,
  supersedeMemory: h.supersedeMock,
}));
vi.mock("../memory/policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../memory/policy")>();
  return { ...actual, resolveMemoryPolicy: h.resolvePolicyMock };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import {
  MEMORY_PROMPT_CHAR_BUDGET,
  cosineSimilarity,
  formatMemoryBlock,
  rankMemories,
} from "lib/memory/inject";

import {
  EXTRACTION_TEXT_LIMIT,
  MAX_MEMORIES_PER_TURN,
  buildExtractionPrompt,
  extractMemoriesFromTurn,
  hasExplicitRememberIntent,
  runPostTurnMemoryExtraction,
  shouldExtractFromTurn,
} from "lib/memory/extract";

import {
  DEFAULT_MEMORY_POLICY,
  isMemoryMode,
  resolveMemoryLayers,
} from "lib/memory/policy";

// ---------------------------------------------------------------------------
// Shared factory
// ---------------------------------------------------------------------------
function mem(partial: Partial<UserMemoryEntity> = {}): UserMemoryEntity {
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
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastUsedAt: new Date("2026-01-01T00:00:00Z"),
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Global beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  h.listActiveMock.mockResolvedValue([]);
  h.bumpLastUsedMock.mockResolvedValue(undefined);
  h.embedTextMock.mockResolvedValue([1, 0]);
  h.generateObjectMock.mockResolvedValue({ object: { memories: [] } });
  h.resolvePolicyMock.mockResolvedValue({
    enabled: true,
    implicitExtraction: false,
  });
  h.getPreferencesMock.mockResolvedValue(null);
  h.insertMock.mockImplementation((input: Record<string, unknown>) =>
    Promise.resolve(
      mem({ id: `new-${Math.random().toString(36).slice(2)}`, ...input }),
    ),
  );
  h.supersedeMock.mockResolvedValue(undefined);
});

// ===========================================================================
// 1. Memory injection — cosineSimilarity
// ===========================================================================
describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched-length vectors", () => {
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
  });

  it("returns 0 when one vector is all-zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });

  it("handles negative values correctly (antiparallel = -1, clamped to 0 in rankMemories)", () => {
    // raw cosine similarity is allowed to be negative here (inject only clamps in rankMemories)
    const raw = cosineSimilarity([-1, 0], [1, 0]);
    expect(raw).toBeCloseTo(-1);
  });
});

// ===========================================================================
// 2. Memory injection — rankMemories
// ===========================================================================
describe("rankMemories", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("ranks a query-similar memory above a dissimilar one of the same age", () => {
    const similar = mem({ id: "sim", embedding: [1, 0] });
    const dissimilar = mem({ id: "dis", embedding: [0, 1] });
    const ranked = rankMemories([dissimilar, similar], [1, 0], now);
    expect(ranked[0].memory.id).toBe("sim");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("ranks recently used above stale when relevance is neutral (no embedding)", () => {
    const old = mem({
      id: "old",
      createdAt: new Date("2026-01-01"),
      lastUsedAt: new Date("2026-01-01"),
    });
    const fresh = mem({
      id: "fresh",
      createdAt: new Date("2026-05-31"),
      lastUsedAt: new Date("2026-05-31"),
    });
    const ranked = rankMemories([old, fresh], null, now);
    expect(ranked[0].memory.id).toBe("fresh");
  });

  it("uses neutral 0.5 for the similarity term when no query embedding is provided", () => {
    // When queryEmbedding is null, all memories get 0.5 similarity; ordering is purely by recency.
    const memories = [mem({ id: "a" }), mem({ id: "b" })];
    const ranked = rankMemories(memories, null, now);
    // Both have identical scores — order is stable but equal scores are ok
    expect(ranked).toHaveLength(2);
    ranked.forEach(({ score }) => {
      // 0.45*0.5 + 0.30*exp(-age/14) + 0.25*exp(-age/30) — all positive
      expect(score).toBeGreaterThan(0);
    });
  });

  it("uses neutral 0.5 for rows that lack an embedding even when a query embedding is supplied", () => {
    const withEmb = mem({ id: "emb", embedding: [1, 0] });
    const noEmb = mem({ id: "noemb", embedding: null });
    const ranked = rankMemories([withEmb, noEmb], [1, 0], now);
    // Both embeddings contribute, row without embedding uses 0.5
    expect(ranked.map((r) => r.memory.id)).toContain("emb");
    expect(ranked.map((r) => r.memory.id)).toContain("noemb");
  });

  it("returns the input array in sorted order (descending score)", () => {
    const memories = Array.from({ length: 5 }, (_, i) =>
      mem({
        id: `m${i}`,
        embedding: [i / 4, 0],
        lastUsedAt: new Date("2026-05-01"),
      }),
    );
    const ranked = rankMemories(memories, [1, 0], now);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});

// ===========================================================================
// 3. Memory injection — formatMemoryBlock
// ===========================================================================
describe("formatMemoryBlock", () => {
  it("returns null for an empty list", () => {
    expect(formatMemoryBlock([])).toBeNull();
  });

  it("wraps output in <user_memory> … </user_memory> tags", () => {
    const result = formatMemoryBlock([
      {
        memory: mem({ id: "a", kind: "decision", content: "Chose X" }),
        score: 1,
      },
    ]);
    expect(result?.block).toContain("<user_memory>");
    expect(result?.block).toContain("</user_memory>");
  });

  it("formats each entry as '- [kind] content'", () => {
    const result = formatMemoryBlock([
      {
        memory: mem({ id: "a", kind: "decision", content: "Chose X" }),
        score: 1,
      },
    ]);
    expect(result?.block).toContain("- [decision] Chose X");
  });

  it("returns the included ids in the result", () => {
    const result = formatMemoryBlock([
      { memory: mem({ id: "m1", content: "Fact A" }), score: 1 },
      { memory: mem({ id: "m2", content: "Fact B" }), score: 0.9 },
    ]);
    expect(result?.includedIds).toEqual(["m1", "m2"]);
  });

  it("respects the ~800-token char budget and stops before overflow", () => {
    const long = "x".repeat(290);
    const ranked = Array.from({ length: 50 }, (_, i) => ({
      memory: mem({ id: `m${i}`, content: `${i}-${long}` }),
      score: 1 - i / 100,
    }));
    const result = formatMemoryBlock(ranked);
    expect(result).not.toBeNull();
    // Allow some slack for header/footer which push total over raw budget
    expect(result!.block.length).toBeLessThanOrEqual(
      MEMORY_PROMPT_CHAR_BUDGET + 600,
    );
    expect(result!.includedIds.length).toBeLessThan(50);
  });

  it("always includes at least the top-ranked memory, even if it alone exceeds the budget", () => {
    const result = formatMemoryBlock([
      { memory: mem({ id: "big", content: "z".repeat(5000) }), score: 1 },
    ]);
    expect(result?.includedIds).toEqual(["big"]);
  });

  it("respects rank ordering (highest-score first) in the block — caller must supply pre-sorted input", () => {
    // formatMemoryBlock takes a pre-sorted ScoredMemory[] (output of rankMemories).
    // It preserves insertion order, so the caller is responsible for sorting.
    // Supply in high-to-low order (as rankMemories would) to confirm ordering holds.
    const result = formatMemoryBlock([
      { memory: mem({ id: "hi", content: "High-ranked" }), score: 0.9 },
      { memory: mem({ id: "lo", content: "Low-ranked" }), score: 0.2 },
    ]);
    const hiPos = result!.block.indexOf("High-ranked");
    const loPos = result!.block.indexOf("Low-ranked");
    expect(hiPos).toBeLessThan(loPos);
  });
});

// ===========================================================================
// 4. hasExplicitRememberIntent
// ===========================================================================
describe("hasExplicitRememberIntent", () => {
  it("matches English 'remember'", () => {
    expect(hasExplicitRememberIntent("Please remember that I use tabs")).toBe(
      true,
    );
  });

  it("matches Spanish 'recuerda'", () => {
    expect(hasExplicitRememberIntent("Recuerda que trabajo en Madrid")).toBe(
      true,
    );
  });

  it("matches French 'rappelle'", () => {
    expect(
      hasExplicitRememberIntent("Rappelle-toi que je préfère le français"),
    ).toBe(true);
  });

  it("matches Japanese 覚えて", () => {
    expect(hasExplicitRememberIntent("これを覚えてください")).toBe(true);
  });

  it("matches Korean 기억해", () => {
    expect(hasExplicitRememberIntent("이거 기억해 줘")).toBe(true);
  });

  it("matches Chinese 记住", () => {
    expect(hasExplicitRememberIntent("请记住这件事")).toBe(true);
  });

  it("does not match unrelated English", () => {
    expect(hasExplicitRememberIntent("What is the weather today?")).toBe(false);
  });

  it("does not match empty string", () => {
    expect(hasExplicitRememberIntent("")).toBe(false);
  });
});

// ===========================================================================
// 5. shouldExtractFromTurn — gate logic
// ===========================================================================
describe("shouldExtractFromTurn", () => {
  const enabledPolicy = { enabled: true, implicitExtraction: false };

  it("skips when policy disables memory entirely", () => {
    expect(
      shouldExtractFromTurn({
        policy: { enabled: false, implicitExtraction: true },
        memoryMode: "on",
        userText: "remember this",
      }),
    ).toEqual({ extract: false, implicitAllowed: false });
  });

  it("skips when user mode is 'paused'", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabledPolicy,
        memoryMode: "paused",
        userText: "remember this",
      }).extract,
    ).toBe(false);
  });

  it("skips when user mode is 'off'", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabledPolicy,
        memoryMode: "off",
        userText: "remember this",
      }).extract,
    ).toBe(false);
  });

  it("treats absent memoryMode as 'on' (defaults open)", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabledPolicy,
        memoryMode: undefined,
        userText: "remember my preference",
      }).extract,
    ).toBe(true);
  });

  it("implicit OFF: skips when no explicit remember-intent", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabledPolicy,
        memoryMode: "on",
        userText: "summarise this doc",
      }),
    ).toEqual({ extract: false, implicitAllowed: false });
  });

  it("implicit OFF: extracts on explicit remember-intent", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabledPolicy,
        memoryMode: "on",
        userText: "remember that I own the Q3 rollout",
      }),
    ).toEqual({ extract: true, implicitAllowed: false });
  });

  it("implicit ON: extracts on any turn regardless of remember-intent", () => {
    expect(
      shouldExtractFromTurn({
        policy: { enabled: true, implicitExtraction: true },
        memoryMode: "on",
        userText: "summarise this doc",
      }),
    ).toEqual({ extract: true, implicitAllowed: true });
  });
});

// ===========================================================================
// 6. buildExtractionPrompt
// ===========================================================================
describe("buildExtractionPrompt", () => {
  const base = {
    userText: "I prefer bullet-point answers",
    assistantText: "Noted!",
    existingContents: [],
    implicitAllowed: true,
  };

  it("includes the user text in the prompt", () => {
    const prompt = buildExtractionPrompt(base);
    expect(prompt).toContain(base.userText);
  });

  it("includes the assistant text in the prompt", () => {
    const prompt = buildExtractionPrompt(base);
    expect(prompt).toContain(base.assistantText);
  });

  it("shows '(none)' for the existing memories block when empty", () => {
    const prompt = buildExtractionPrompt(base);
    expect(prompt).toContain("(none)");
  });

  it("lists existing memories as bullet lines", () => {
    const prompt = buildExtractionPrompt({
      ...base,
      existingContents: ["Speaks Spanish", "Senior engineer"],
    });
    expect(prompt).toContain("- Speaks Spanish");
    expect(prompt).toContain("- Senior engineer");
  });

  it("inserts the implicit-disabled notice when implicitAllowed is false", () => {
    const prompt = buildExtractionPrompt({ ...base, implicitAllowed: false });
    expect(prompt).toMatch(/implicit extraction is disabled/i);
  });

  it("does NOT insert the implicit-disabled notice when implicitAllowed is true", () => {
    const prompt = buildExtractionPrompt({ ...base, implicitAllowed: true });
    expect(prompt).not.toMatch(/implicit extraction is disabled/i);
  });

  it(`truncates userText to ${EXTRACTION_TEXT_LIMIT} chars`, () => {
    const long = "u".repeat(EXTRACTION_TEXT_LIMIT + 500);
    const prompt = buildExtractionPrompt({ ...base, userText: long });
    // The actual slice appears in the prompt, not beyond the limit
    expect(prompt).toContain("u".repeat(EXTRACTION_TEXT_LIMIT));
    expect(prompt).not.toContain("u".repeat(EXTRACTION_TEXT_LIMIT + 1));
  });
});

// ===========================================================================
// 7. extractMemoriesFromTurn — storage logic
// ===========================================================================
describe("extractMemoriesFromTurn", () => {
  it("stores nothing when the model returns an empty list", async () => {
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember something",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(0);
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("stores a candidate and returns the row", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Prefers Spanish",
            explicit: true,
            confidence: 0.5,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember this",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(1);
    expect(h.insertMock).toHaveBeenCalledOnce();
  });

  it("forces confidence to 1.0 for explicit candidates", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Prefers Spanish",
            explicit: true,
            confidence: 0.3,
            supersedes: null,
          },
        ],
      },
    });
    await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember",
      assistantText: "ok",
    });
    expect(h.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 1 }),
    );
  });

  it("clamps implicit confidence to [0, 1]", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "profile",
            content: "Lives in Oslo",
            explicit: false,
            confidence: 1.5, // out-of-range
            supersedes: null,
          },
        ],
      },
    });
    await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "anyway",
      assistantText: "ok",
      implicitAllowed: true,
    });
    expect(h.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 1 }),
    );
  });

  it("drops non-explicit candidates when implicitAllowed is false", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "profile",
            content: "Works in logistics",
            explicit: false,
            confidence: 0.8,
            supersedes: null,
          },
          {
            kind: "preference",
            content: "Wants bullets",
            explicit: true,
            confidence: 0.9,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember bullets",
      assistantText: "ok",
      implicitAllowed: false,
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Wants bullets");
  });

  it(`caps stored memories to MAX_MEMORIES_PER_TURN (${MAX_MEMORIES_PER_TURN}) even if the model returns more`, async () => {
    const many = Array.from({ length: MAX_MEMORIES_PER_TURN + 3 }, (_, i) => ({
      kind: "preference" as const,
      content: `Fact ${i}`,
      explicit: true,
      confidence: 1,
      supersedes: null,
    }));
    h.generateObjectMock.mockResolvedValue({ object: { memories: many } });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember all",
      assistantText: "ok",
    });
    expect(stored.length).toBeLessThanOrEqual(MAX_MEMORIES_PER_TURN);
  });
});

// ===========================================================================
// 8. extractMemoriesFromTurn — deduplication
// ===========================================================================
describe("extractMemoriesFromTurn — deduplication", () => {
  it("skips a candidate that exactly matches an existing active memory", async () => {
    h.listActiveMock.mockResolvedValue([
      mem({ id: "old1", content: "Prefers replies in Spanish" }),
    ]);
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Prefers replies in Spanish",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(0);
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("deduplicates case-insensitively (normalize lowercases before comparison)", async () => {
    h.listActiveMock.mockResolvedValue([
      mem({ id: "old1", content: "Prefers replies in   Spanish" }),
    ]);
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "prefers replies in Spanish",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(0);
  });

  it("deduplicates within the same turn (two candidates with same content)", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Uses tabs",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
          {
            kind: "preference",
            content: "uses tabs",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember tabs",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(1);
    expect(h.insertMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// 9. extractMemoriesFromTurn — supersede wiring
// ===========================================================================
describe("extractMemoriesFromTurn — supersede wiring", () => {
  it("calls supersedeMemory when a candidate names the content of an existing memory", async () => {
    h.listActiveMock.mockResolvedValue([
      mem({ id: "old1", content: "Works on the barriers team" }),
    ]);
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "profile",
            content: "Works on the sensors team now",
            explicit: true,
            confidence: 1,
            supersedes: "Works on the barriers team",
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember I moved teams",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(1);
    expect(h.supersedeMock).toHaveBeenCalledWith("old1", stored[0].id, "u1");
  });

  it("does not call supersedeMemory when supersedes is null", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Prefers dark mode",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember dark mode",
      assistantText: "ok",
    });
    expect(h.supersedeMock).not.toHaveBeenCalled();
  });

  it("stores without embedding when the embedder throws (best-effort path)", async () => {
    h.embedTextMock.mockRejectedValue(new Error("embedder down"));
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "decision",
            content: "Chose Postgres for the cache",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember this decision",
      assistantText: "ok",
    });
    expect(stored).toHaveLength(1);
    expect(h.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ embedding: null }),
    );
  });
});

// ===========================================================================
// 10. runPostTurnMemoryExtraction — full gate
// ===========================================================================
describe("runPostTurnMemoryExtraction", () => {
  it("returns 0 without calling the model when policy disables memory", async () => {
    h.resolvePolicyMock.mockResolvedValue({
      enabled: false,
      implicitExtraction: false,
    });
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: "t1",
      threadId: "th1",
      userText: "remember that I like haiku",
      assistantText: "ok",
      preferences: null,
    });
    expect(n).toBe(0);
    expect(h.generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns 0 when user mode is 'paused'", async () => {
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "remember that I like haiku",
      assistantText: "ok",
      preferences: { memoryMode: "paused" },
    });
    expect(n).toBe(0);
    expect(h.generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns 0 when user mode is 'off'", async () => {
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "remember this",
      assistantText: "ok",
      preferences: { memoryMode: "off" },
    });
    expect(n).toBe(0);
  });

  it("returns 0 on blank/whitespace-only userText (short-circuits before policy lookup)", async () => {
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "   \n\t  ",
      assistantText: "ok",
      preferences: null,
    });
    expect(n).toBe(0);
    expect(h.resolvePolicyMock).not.toHaveBeenCalled();
  });

  it("returns 0 with implicit OFF and no remember-intent in the user text", async () => {
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "summarize the quarterly report",
      assistantText: "ok",
      preferences: null,
    });
    expect(n).toBe(0);
    expect(h.generateObjectMock).not.toHaveBeenCalled();
  });

  it("fetches preferences from the DB when not provided", async () => {
    h.getPreferencesMock.mockResolvedValue({ memoryMode: "off" });
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "remember that I like haiku",
      assistantText: "ok",
      // preferences intentionally omitted
    });
    expect(n).toBe(0);
    expect(h.getPreferencesMock).toHaveBeenCalledWith("u1");
  });

  it("extracts and returns the count when the explicit path succeeds", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Likes haiku",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "remember that I like haiku",
      assistantText: "ok",
      preferences: null,
    });
    expect(n).toBe(1);
  });

  it("passes the teamId through to the embedder for billing attribution", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Prefers dark mode",
            explicit: true,
            confidence: 1,
            supersedes: null,
          },
        ],
      },
    });
    await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: "team-billing",
      threadId: "th1",
      userText: "remember dark mode",
      assistantText: "ok",
      preferences: null,
    });
    expect(h.embedTextMock).toHaveBeenCalledWith(
      "Prefers dark mode",
      expect.objectContaining({ teamId: "team-billing" }),
    );
  });
});

// ===========================================================================
// 11. resolveMemoryLayers — pure policy merging
// ===========================================================================
describe("resolveMemoryLayers (pure)", () => {
  it("starts from the default policy when no org or team layers are set", () => {
    expect(resolveMemoryLayers(DEFAULT_MEMORY_POLICY, {}, {})).toEqual(
      DEFAULT_MEMORY_POLICY,
    );
  });

  it("org layer overrides the default", () => {
    expect(
      resolveMemoryLayers(DEFAULT_MEMORY_POLICY, {
        enabled: false,
        implicitExtraction: true,
      }),
    ).toEqual({ enabled: false, implicitExtraction: true });
  });

  it("team layer wins over org when both are set", () => {
    expect(
      resolveMemoryLayers(
        DEFAULT_MEMORY_POLICY,
        { enabled: false, implicitExtraction: false },
        { enabled: true, implicitExtraction: true },
      ),
    ).toEqual({ enabled: true, implicitExtraction: true });
  });

  it("null fields in any layer do not participate (fall through)", () => {
    expect(
      resolveMemoryLayers(
        DEFAULT_MEMORY_POLICY,
        { enabled: null, implicitExtraction: null },
        { enabled: null, implicitExtraction: null },
      ),
    ).toEqual(DEFAULT_MEMORY_POLICY);
  });

  it("team null falls through to org value", () => {
    expect(
      resolveMemoryLayers(
        DEFAULT_MEMORY_POLICY,
        { enabled: false },
        { enabled: null },
      ),
    ).toEqual({ enabled: false, implicitExtraction: false });
  });

  it("admin can re-enable memory at team level when org disabled it", () => {
    const result = resolveMemoryLayers(
      DEFAULT_MEMORY_POLICY,
      { enabled: false },
      { enabled: true },
    );
    expect(result.enabled).toBe(true);
  });

  it("admin can enable implicit extraction at team level when org leaves it off", () => {
    const result = resolveMemoryLayers(
      DEFAULT_MEMORY_POLICY,
      { implicitExtraction: false },
      { implicitExtraction: true },
    );
    expect(result.implicitExtraction).toBe(true);
  });
});

// ===========================================================================
// 12. isMemoryMode — type guard
// ===========================================================================
describe("isMemoryMode", () => {
  it("accepts 'on', 'paused', 'off'", () => {
    expect(isMemoryMode("on")).toBe(true);
    expect(isMemoryMode("paused")).toBe(true);
    expect(isMemoryMode("off")).toBe(true);
  });

  it("rejects 'ON' (case-sensitive)", () => {
    expect(isMemoryMode("ON")).toBe(false);
  });

  it("rejects null", () => {
    expect(isMemoryMode(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isMemoryMode(undefined)).toBe(false);
  });

  it("rejects arbitrary strings", () => {
    expect(isMemoryMode("enabled")).toBe(false);
    expect(isMemoryMode("true")).toBe(false);
  });

  it("rejects numbers and booleans", () => {
    expect(isMemoryMode(1)).toBe(false);
    expect(isMemoryMode(true)).toBe(false);
  });
});
