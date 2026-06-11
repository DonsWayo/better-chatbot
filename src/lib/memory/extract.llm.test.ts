import { describe, expect, it, vi } from "vitest";

// Opt-in real-LLM tier (RUN_LLM_TESTS=1 pnpm test:llm) — see vitest.llm.config.ts.
const RUN = Boolean(
  process.env.OPENROUTER_API_KEY && process.env.RUN_LLM_TESTS === "1",
);

// Real extractor model call; ONLY the persistence layer (store) + db-touching
// modules are mocked, so this exercises buildExtractionPrompt + the real
// deepseek-v4-flash generateObject roundtrip end-to-end.
const h = vi.hoisted(() => ({
  insertMock: vi.fn(),
  listActiveMock: vi.fn(),
  supersedeMock: vi.fn(),
}));

vi.mock("./store", () => ({
  listActiveMemories: h.listActiveMock,
  insertMemory: h.insertMock,
  supersedeMemory: h.supersedeMock,
}));
vi.mock("./policy", () => ({ resolveMemoryPolicy: vi.fn() }));
vi.mock("lib/db/repository", () => ({ userRepository: {} }));
vi.mock("lib/ai/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue(null),
}));

import { extractMemoriesFromTurn } from "./extract";
import type { InsertMemoryInput } from "./store";

describe.skipIf(!RUN)(
  "memory extraction roundtrip (real deepseek-v4-flash)",
  () => {
    it(
      'extracts an explicit profile fact from "Remember that I am the Head of Software Development."',
      { timeout: 30_000 },
      async () => {
        h.listActiveMock.mockResolvedValue([]);
        h.insertMock.mockImplementation(async (input: InsertMemoryInput) => ({
          id: "mem-llm-1",
          status: "active",
          scopeId: null,
          embedding: null,
          sourceThreadId: input.sourceThreadId ?? null,
          supersededById: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...input,
        }));

        const stored = await extractMemoriesFromTurn({
          userId: "user-llm-test",
          threadId: "thread-llm-test",
          userText: "Remember that I am the Head of Software Development.",
          assistantText:
            "Got it — I'll remember that you are the Head of Software Development.",
          implicitAllowed: true,
        });

        expect(stored.length).toBeGreaterThanOrEqual(1);

        const inserted = h.insertMock.mock.calls.map(
          (call) => call[0] as InsertMemoryInput,
        );
        const fact = inserted.find((m) =>
          /head of software development/i.test(m.content),
        );
        expect(fact, "extractor should capture the stated role").toBeDefined();
        // Stable role facts are "profile"-kind in the extraction taxonomy.
        expect(fact?.kind).toBe("profile");
        // Explicit "remember that…" → confidence forced to 1.0 by extract.ts.
        expect(fact?.confidence).toBe(1);
        // Nothing superseded on a clean slate.
        expect(h.supersedeMock).not.toHaveBeenCalled();
      },
    );
  },
);
