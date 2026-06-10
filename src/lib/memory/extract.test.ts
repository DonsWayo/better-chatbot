import type { UserMemoryEntity } from "lib/db/pg/schema.pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  listActiveMock: vi.fn(),
  insertMock: vi.fn(),
  supersedeMock: vi.fn(),
  embedTextMock: vi.fn(),
  resolvePolicyMock: vi.fn(),
  getPreferencesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateObject: h.generateObjectMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/embeddings", () => ({ embedText: h.embedTextMock }));
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
  insertMemory: h.insertMock,
  supersedeMemory: h.supersedeMock,
}));
vi.mock("./policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./policy")>();
  return { ...actual, resolveMemoryPolicy: h.resolvePolicyMock };
});

import {
  extractMemoriesFromTurn,
  hasExplicitRememberIntent,
  runPostTurnMemoryExtraction,
  shouldExtractFromTurn,
} from "./extract";

function memory(partial: Partial<UserMemoryEntity>): UserMemoryEntity {
  return {
    id: "m0",
    userId: "u1",
    scopeId: null,
    kind: "preference",
    content: "existing fact",
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
  h.embedTextMock.mockResolvedValue([0.1, 0.2]);
  h.insertMock.mockImplementation((input: Record<string, unknown>) =>
    Promise.resolve(
      memory({ id: `new-${h.insertMock.mock.calls.length}`, ...input }),
    ),
  );
  h.generateObjectMock.mockResolvedValue({ object: { memories: [] } });
  h.resolvePolicyMock.mockResolvedValue({
    enabled: true,
    implicitExtraction: false,
  });
  h.getPreferencesMock.mockResolvedValue(null);
});

describe("hasExplicitRememberIntent", () => {
  it("matches remember-intent across locales", () => {
    expect(hasExplicitRememberIntent("Please remember that I use tabs")).toBe(
      true,
    );
    expect(hasExplicitRememberIntent("Recuerda que trabajo en Madrid")).toBe(
      true,
    );
    expect(hasExplicitRememberIntent("これを覚えてください")).toBe(true);
    expect(hasExplicitRememberIntent("이거 기억해 줘")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(hasExplicitRememberIntent("What is the weather like?")).toBe(false);
    expect(hasExplicitRememberIntent("")).toBe(false);
  });
});

describe("shouldExtractFromTurn (gate logic)", () => {
  const enabled = { enabled: true, implicitExtraction: false };

  it("skips when org/team policy disables memory", () => {
    expect(
      shouldExtractFromTurn({
        policy: { enabled: false, implicitExtraction: true },
        memoryMode: "on",
        userText: "remember this",
      }),
    ).toEqual({ extract: false, implicitAllowed: false });
  });

  it("skips when the user mode is paused or off", () => {
    for (const memoryMode of ["paused", "off"] as const) {
      expect(
        shouldExtractFromTurn({
          policy: { enabled: true, implicitExtraction: true },
          memoryMode,
          userText: "remember this",
        }).extract,
      ).toBe(false);
    }
  });

  it("absent mode defaults to on", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabled,
        memoryMode: undefined,
        userText: "remember that I like haiku",
      }).extract,
    ).toBe(true);
  });

  it("implicit OFF: extracts only on explicit remember-intent", () => {
    expect(
      shouldExtractFromTurn({
        policy: enabled,
        memoryMode: "on",
        userText: "summarize this doc",
      }),
    ).toEqual({ extract: false, implicitAllowed: false });
    expect(
      shouldExtractFromTurn({
        policy: enabled,
        memoryMode: "on",
        userText: "remember that I own the Q3 rollout",
      }),
    ).toEqual({ extract: true, implicitAllowed: false });
  });

  it("implicit ON: extracts on any turn", () => {
    expect(
      shouldExtractFromTurn({
        policy: { enabled: true, implicitExtraction: true },
        memoryMode: "on",
        userText: "summarize this doc",
      }),
    ).toEqual({ extract: true, implicitAllowed: true });
  });
});

describe("extractMemoriesFromTurn", () => {
  it("stores candidates with embeddings; explicit asks get confidence 1.0", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Prefers replies in Spanish",
            explicit: true,
            confidence: 0.4,
            supersedes: null,
          },
        ],
      },
    });
    const stored = await extractMemoriesFromTurn({
      userId: "u1",
      threadId: "t1",
      userText: "remember that I prefer Spanish",
      assistantText: "Noted!",
    });
    expect(stored).toHaveLength(1);
    expect(h.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        sourceThreadId: "t1",
        confidence: 1,
        embedding: [0.1, 0.2],
      }),
    );
  });

  it("drops non-explicit candidates when implicit is not allowed", async () => {
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
            content: "Wants bullet-point answers",
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
      userText: "remember I want bullet points",
      assistantText: "ok",
      implicitAllowed: false,
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Wants bullet-point answers");
  });

  it("dedups against existing active memories (exact-ish match)", async () => {
    h.listActiveMock.mockResolvedValue([
      memory({ id: "old1", content: "Prefers replies in   Spanish" }),
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
    expect(h.insertMock).not.toHaveBeenCalled();
  });

  it("wires supersede hints to the matching active memory", async () => {
    h.listActiveMock.mockResolvedValue([
      memory({ id: "old1", content: "Works on the barriers team" }),
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

  it("stores without embedding when the embedder fails (best-effort)", async () => {
    h.embedTextMock.mockRejectedValue(new Error("embeddings down"));
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

describe("runPostTurnMemoryExtraction (full gate)", () => {
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

  it("returns 0 when the user paused memory", async () => {
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

  it("returns 0 on empty user text", async () => {
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "   ",
      assistantText: "ok",
      preferences: null,
    });
    expect(n).toBe(0);
    expect(h.resolvePolicyMock).not.toHaveBeenCalled();
  });

  it("returns 0 with implicit OFF and no remember-intent", async () => {
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "summarize the report",
      assistantText: "ok",
      preferences: null,
    });
    expect(n).toBe(0);
    expect(h.generateObjectMock).not.toHaveBeenCalled();
  });

  it("falls back to DB preferences when none are passed", async () => {
    h.getPreferencesMock.mockResolvedValue({ memoryMode: "off" });
    const n = await runPostTurnMemoryExtraction({
      userId: "u1",
      teamId: null,
      threadId: "th1",
      userText: "remember that I like haiku",
      assistantText: "ok",
    });
    expect(n).toBe(0);
    expect(h.getPreferencesMock).toHaveBeenCalledWith("u1");
  });

  it("stores on the explicit path and returns the count", async () => {
    h.generateObjectMock.mockResolvedValue({
      object: {
        memories: [
          {
            kind: "preference",
            content: "Likes haiku summaries",
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
});
