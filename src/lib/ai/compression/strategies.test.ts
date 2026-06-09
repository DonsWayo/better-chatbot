import { describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));

import { vi } from "vitest";
import { applyCompression } from "./strategies";
import type { CompressionConfig } from "./config";

const OFF_CONFIG: CompressionConfig = {
  level: "off",
  maxToolOutputChars: Infinity,
  recentMessageWindow: Infinity,
  maxOldAssistantMsgChars: Infinity,
  historyCompressionThreshold: Infinity,
};

const AGGRESSIVE_CONFIG: CompressionConfig = {
  level: "aggressive",
  maxToolOutputChars: 20,
  recentMessageWindow: 2,
  maxOldAssistantMsgChars: 10,
  historyCompressionThreshold: 0, // always trigger history drop
};

type Msg = { role: string; content: string | unknown[] };

function textMsg(role: string, text: string): Msg {
  return { role, content: [{ type: "text", text }] };
}

function toolResultMsg(text: string): Msg {
  return {
    role: "tool",
    content: [{ type: "tool-result", content: [{ type: "text", text }] }],
  };
}

describe("applyCompression — level off", () => {
  it("returns prompt unchanged", () => {
    const prompt = [textMsg("user", "hello")] as any;
    const result = applyCompression(prompt, OFF_CONFIG);
    expect(result.prompt).toBe(prompt);
    expect(result.charsBefore).toBeGreaterThan(0);
    expect(result.charsAfter).toBe(result.charsBefore);
  });
});

describe("applyCompression — tool output truncation", () => {
  it("truncates long tool outputs beyond maxToolOutputChars", () => {
    const longText = "x".repeat(100);
    const prompt = [toolResultMsg(longText)] as any;
    const config: CompressionConfig = { ...AGGRESSIVE_CONFIG, maxToolOutputChars: 20 };
    const result = applyCompression(prompt, config);
    expect(result.charsAfter).toBeLessThan(result.charsBefore);
    const toolMsg = result.prompt[0] as any;
    const text = toolMsg.content[0].content[0].text;
    expect(text).toContain("compressed");
    expect(text.startsWith("x".repeat(20))).toBe(true);
  });

  it("leaves short tool outputs unchanged", () => {
    const prompt = [toolResultMsg("short")] as any;
    const config: CompressionConfig = { ...AGGRESSIVE_CONFIG, maxToolOutputChars: 100 };
    const result = applyCompression(prompt, config);
    const toolMsg = result.prompt[0] as any;
    expect(toolMsg.content[0].content[0].text).toBe("short");
  });
});

describe("applyCompression — old assistant message truncation", () => {
  it("truncates old assistant messages outside the recent window", () => {
    const msgs = [
      textMsg("user", "msg1"),
      textMsg("assistant", "a".repeat(200)),
      textMsg("user", "msg3"),
      textMsg("assistant", "b".repeat(200)),
      textMsg("user", "msg5"),
      textMsg("assistant", "recent reply"),
    ] as any;
    const config: CompressionConfig = {
      ...AGGRESSIVE_CONFIG,
      maxOldAssistantMsgChars: 10,
      recentMessageWindow: 2,
      historyCompressionThreshold: Infinity, // disable history drop
    };
    const result = applyCompression(msgs, config);
    // Old assistant message at index 1 should be truncated
    const oldAssistant = result.prompt[1] as any;
    expect(oldAssistant.content[0].text).toContain("compressed");
    // Recent assistant message (last one) should be preserved
    const recentAssistant = result.prompt[5] as any;
    expect(recentAssistant.content[0].text).toBe("recent reply");
  });
});

describe("applyCompression — history drop", () => {
  it("drops old messages and inserts compression note when above threshold", () => {
    const msgs = Array.from({ length: 10 }, (_, i) =>
      textMsg(i % 2 === 0 ? "user" : "assistant", `message ${i}`),
    ) as any;
    const config: CompressionConfig = {
      ...AGGRESSIVE_CONFIG,
      historyCompressionThreshold: 0,
      recentMessageWindow: 2,
      maxToolOutputChars: Infinity,
      maxOldAssistantMsgChars: Infinity,
    };
    const result = applyCompression(msgs, config);
    // Should have kept only recent messages + system note
    expect(result.prompt.length).toBeLessThan(msgs.length);
    const hasNote = result.prompt.some((m: any) => {
      const content = m.content;
      if (Array.isArray(content)) {
        return content.some(
          (p: any) => p.type === "text" && typeof p.text === "string" && p.text.includes("omitted"),
        );
      }
      return false;
    });
    expect(hasNote).toBe(true);
  });

  it("does not drop when below threshold", () => {
    const msgs = [textMsg("user", "hello")] as any;
    const config: CompressionConfig = {
      ...AGGRESSIVE_CONFIG,
      historyCompressionThreshold: 10_000,
      maxToolOutputChars: Infinity,
      maxOldAssistantMsgChars: Infinity,
    };
    const result = applyCompression(msgs, config);
    expect(result.prompt).toHaveLength(1);
  });
});

describe("applyCompression — charsBefore/charsAfter", () => {
  it("charsAfter <= charsBefore after compression", () => {
    const msgs = [
      toolResultMsg("x".repeat(500)),
      textMsg("assistant", "y".repeat(500)),
    ] as any;
    const result = applyCompression(msgs, AGGRESSIVE_CONFIG);
    expect(result.charsAfter).toBeLessThanOrEqual(result.charsBefore);
  });
});
