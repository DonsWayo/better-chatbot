import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("prom-client", () => ({
  Counter: vi.fn().mockImplementation(() => ({ inc: vi.fn() })),
  Histogram: vi.fn().mockImplementation(() => ({ observe: vi.fn() })),
}));
vi.mock("./metrics", () => ({
  recordCompressionSavings: vi.fn(),
  compressionCharsSaved: { inc: vi.fn() },
  compressionRatio: { observe: vi.fn() },
}));

import { applyCompression } from "./strategies";
import { buildCompressionConfig } from "./config";
import { wrapWithCompression, compressionLevelFromPolicy } from "./index";
import type { LanguageModelMiddleware } from "ai";

// Extract prompt type from middleware signature
type Prompt = Parameters<
  NonNullable<LanguageModelMiddleware["transformParams"]>
>[0]["params"]["prompt"];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function textMsg(role: "system" | "user" | "assistant", text: string): Prompt[number] {
  return {
    role,
    content: [{ type: "text" as const, text }],
  } as Prompt[number];
}

function toolResultMsg(text: string): Prompt[number] {
  return {
    role: "tool" as const,
    content: [
      {
        type: "tool-result" as const,
        toolCallId: "id-1",
        toolName: "read_file",
        content: [{ type: "text" as const, text }],
      },
    ],
  } as unknown as Prompt[number];
}

function charCount(prompt: Prompt): number {
  let n = 0;
  for (const msg of prompt) {
    const c = msg.content;
    if (typeof c === "string") { n += c.length; continue; }
    if (!Array.isArray(c)) continue;
    for (const part of c) {
      if (typeof part === "object" && part !== null) {
        if ("text" in part && typeof (part as { text?: unknown }).text === "string") {
          n += ((part as { text: string }).text).length;
        } else if ("content" in part && Array.isArray((part as { content?: unknown }).content)) {
          for (const sub of (part as { content: unknown[] }).content) {
            if (typeof sub === "object" && sub !== null && "text" in sub) {
              n += ((sub as { text: string }).text).length;
            }
          }
        }
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

describe("buildCompressionConfig", () => {
  it("off level has Infinity limits", () => {
    const cfg = buildCompressionConfig("off");
    expect(cfg.maxToolOutputChars).toBe(Infinity);
    expect(cfg.historyCompressionThreshold).toBe(Infinity);
  });

  it("aggressive has smaller limits than standard", () => {
    const agg = buildCompressionConfig("aggressive");
    const std = buildCompressionConfig("standard");
    expect(agg.maxToolOutputChars).toBeLessThan(std.maxToolOutputChars);
    expect(agg.maxOldAssistantMsgChars).toBeLessThan(std.maxOldAssistantMsgChars);
  });

  it("overrides merge with level defaults", () => {
    const cfg = buildCompressionConfig("standard", { maxToolOutputChars: 100 });
    expect(cfg.maxToolOutputChars).toBe(100);
    expect(cfg.level).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// applyCompression — tool output truncation
// ---------------------------------------------------------------------------

describe("applyCompression: tool output truncation", () => {
  it("truncates large tool-call result", () => {
    const bigText = "x".repeat(10_000);
    const prompt: Prompt = [toolResultMsg(bigText)];
    const cfg = buildCompressionConfig("standard"); // maxToolOutputChars = 4000
    const { charsBefore, charsAfter } = applyCompression(prompt, cfg);

    expect(charsBefore).toBe(10_000);
    expect(charsAfter).toBeLessThan(10_000);
    expect(charsAfter).toBeLessThanOrEqual(cfg.maxToolOutputChars + 100);
  });

  it("preserves small tool-call result", () => {
    const prompt: Prompt = [toolResultMsg("result")];
    const cfg = buildCompressionConfig("standard");
    const { charsBefore, charsAfter } = applyCompression(prompt, cfg);
    expect(charsBefore).toBe(charsAfter);
  });

  it("off level does not truncate", () => {
    const bigText = "y".repeat(20_000);
    const prompt: Prompt = [toolResultMsg(bigText)];
    const cfg = buildCompressionConfig("off");
    const { charsBefore, charsAfter } = applyCompression(prompt, cfg);
    expect(charsBefore).toBe(charsAfter);
  });
});

// ---------------------------------------------------------------------------
// applyCompression — old assistant message truncation
// ---------------------------------------------------------------------------

describe("applyCompression: old assistant message truncation", () => {
  it("truncates assistant messages outside the recent window", () => {
    const oldText = "a".repeat(5_000);
    const turns: Prompt = [];
    for (let i = 0; i < 10; i++) {
      turns.push(textMsg("user", "user msg " + i));
      turns.push(textMsg("assistant", i < 4 ? oldText : "short reply"));
    }
    const cfg = buildCompressionConfig("standard");
    const { charsAfter, charsBefore } = applyCompression(turns, cfg);
    expect(charsAfter).toBeLessThan(charsBefore);
  });

  it("does not touch recent assistant messages", () => {
    const prompt: Prompt = [
      textMsg("user", "hello"),
      textMsg("assistant", "a".repeat(5_000)),
    ];
    const cfg = buildCompressionConfig("standard");
    const before = charCount(prompt);
    const { charsAfter } = applyCompression(prompt, cfg);
    expect(charsAfter).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// applyCompression — history drop
// ---------------------------------------------------------------------------

describe("applyCompression: history drop", () => {
  it("drops old messages when total exceeds threshold", () => {
    const turns: Prompt = [];
    for (let i = 0; i < 20; i++) {
      turns.push(textMsg("user", "u".repeat(500)));
      turns.push(textMsg("assistant", "a".repeat(500)));
    }
    const cfg = buildCompressionConfig("aggressive");
    const { charsBefore, charsAfter, prompt: compressed } = applyCompression(turns, cfg);

    expect(charsAfter).toBeLessThan(charsBefore);

    // Should inject a compression note
    const systemMsgs = compressed.filter((m) => m.role === "system");
    const hasNote = systemMsgs.some((m) => {
      const c = m.content;
      if (!Array.isArray(c)) return false;
      return c.some(
        (p) => typeof p === "object" && p !== null && "text" in p &&
          String((p as { text?: string }).text ?? "").includes("older message"),
      );
    });
    expect(hasNote).toBe(true);
  });

  it("preserves system messages through history drop", () => {
    const turns: Prompt = [
      textMsg("system", "You are a helpful assistant."),
      ...Array.from({ length: 30 }, (_, i) => [
        textMsg("user", "u".repeat(300)),
        textMsg("assistant", "a".repeat(300)),
      ]).flat(),
    ];
    const cfg = buildCompressionConfig("aggressive");
    const { prompt: compressed } = applyCompression(turns, cfg);

    const systemMsgs = compressed.filter((m) => m.role === "system");
    const hasOriginal = systemMsgs.some((m) => {
      const c = m.content;
      if (!Array.isArray(c)) return false;
      return c.some(
        (p) => typeof p === "object" && p !== null && "text" in p &&
          String((p as { text?: string }).text ?? "").includes("helpful assistant"),
      );
    });
    expect(hasOriginal).toBe(true);
  });

  it("does not drop history below the threshold", () => {
    const prompt: Prompt = [
      textMsg("user", "hi"),
      textMsg("assistant", "hello"),
    ];
    const cfg = buildCompressionConfig("standard");
    const before = charCount(prompt);
    const { charsAfter } = applyCompression(prompt, cfg);
    expect(charsAfter).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// compressionLevelFromPolicy
// ---------------------------------------------------------------------------

describe("compressionLevelFromPolicy", () => {
  it("maps strict → aggressive", () => {
    expect(compressionLevelFromPolicy("strict")).toBe("aggressive");
  });
  it("maps permissive → light", () => {
    expect(compressionLevelFromPolicy("permissive")).toBe("light");
  });
  it("maps standard → standard", () => {
    expect(compressionLevelFromPolicy("standard")).toBe("standard");
  });
  it("maps null → standard", () => {
    expect(compressionLevelFromPolicy(null)).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// wrapWithCompression
// ---------------------------------------------------------------------------

describe("wrapWithCompression", () => {
  const fakeModel = {
    specificationVersion: "v2" as const,
    provider: "test",
    modelId: "test",
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn().mockResolvedValue({ content: [], finishReason: "stop", usage: {} }),
    doStream: vi.fn(),
  };

  it("returns model unchanged when level=off", () => {
    const result = wrapWithCompression(fakeModel as any, { level: "off" });
    expect(result).toBe(fakeModel);
  });

  it("wraps model when compression is enabled", () => {
    const result = wrapWithCompression(fakeModel as any, { level: "standard" });
    expect(result).not.toBe(fakeModel);
    expect(result).toBeDefined();
  });
});

describe("wrapWithCompression — invariants", () => {
  const baseModel = {
    specificationVersion: "v2" as const,
    provider: "test",
    modelId: "model-id",
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn().mockResolvedValue({ content: [], finishReason: "stop", usage: {} }),
    doStream: vi.fn(),
  };

  it("returns a non-null object for any valid level", () => {
    for (const level of ["off", "light", "standard", "aggressive"] as const) {
      const result = wrapWithCompression(baseModel as any, { level });
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    }
  });

  it("level=light wraps model (not same reference)", () => {
    const result = wrapWithCompression(baseModel as any, { level: "light" });
    expect(result).not.toBe(baseModel);
  });

  it("level=aggressive wraps model (not same reference)", () => {
    const result = wrapWithCompression(baseModel as any, { level: "aggressive" });
    expect(result).not.toBe(baseModel);
  });

  it("level=off preserves exact same model reference", () => {
    const result = wrapWithCompression(baseModel as any, { level: "off" });
    expect(result).toBe(baseModel);
  });
});

describe("wrapWithCompression — additional invariants", () => {
  const model = {
    specificationVersion: "v2" as const,
    provider: "test",
    modelId: "m",
    defaultObjectGenerationMode: undefined,
    doGenerate: vi.fn().mockResolvedValue({ content: [], finishReason: "stop", usage: {} }),
    doStream: vi.fn(),
  };

  it("level=standard returns a non-null object", () => {
    const result = wrapWithCompression(model as any, { level: "standard" });
    expect(result).not.toBeNull();
  });

  it("result has modelId property", () => {
    const result = wrapWithCompression(model as any, { level: "standard" });
    expect(result).toHaveProperty("modelId");
  });

  it("result has provider property", () => {
    const result = wrapWithCompression(model as any, { level: "light" });
    expect(result).toHaveProperty("provider");
  });

  it("level=off returns object identical to input model", () => {
    const result = wrapWithCompression(model as any, { level: "off" });
    expect(result.modelId).toBe(model.modelId);
  });
});
