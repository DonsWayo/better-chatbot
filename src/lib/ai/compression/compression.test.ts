import { describe, it, expect } from "vitest";
import { compressMessages } from "./index";
import type { UIMessage } from "ai";

function makeMessages(count: number): UIMessage[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? "user" : "assistant",
        parts: [{ type: "text", text: `Message number ${i}: ${"x".repeat(100)}` }],
        createdAt: new Date(),
      }) as UIMessage,
  );
}

describe("compressMessages", () => {
  it("passes through short conversations unchanged", async () => {
    const msgs = makeMessages(4);
    const result = await compressMessages(msgs, { maxContextTokens: 10_000 });
    expect(result.compressed).toBe(false);
    expect(result.messages).toHaveLength(4);
  });

  it("truncates to recent messages when context is exceeded", async () => {
    const msgs = makeMessages(20);
    // Force compression by setting a very low token limit
    const result = await compressMessages(msgs, {
      maxContextTokens: 10,
      targetUtilization: 0.5,
      preserveRecentMessages: 4,
    });
    expect(result.compressed).toBe(true);
    expect(result.messages.length).toBeLessThanOrEqual(4);
  });
});
