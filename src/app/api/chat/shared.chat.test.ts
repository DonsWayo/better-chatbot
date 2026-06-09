import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectExecuteAbility: vi.fn().mockResolvedValue([]) },
}));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }), error: vi.fn() },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { tools: vi.fn().mockResolvedValue({}), toolCall: vi.fn() },
}));
vi.mock("lib/ai/tools/tool-kit", () => ({ APP_DEFAULT_TOOL_KIT: [] }));
vi.mock("lib/utils", () => ({
  errorToString: vi.fn((e: any) => String(e)),
  exclude: vi.fn((obj: any, keys: string[]) => {
    const r = { ...obj };
    for (const k of keys) delete r[k];
    return r;
  }),
  objectFlow: vi.fn((obj: any) => ({
    filter: vi.fn((fn: any) => {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (fn(v, k)) result[k] = v;
      }
      return result;
    }),
    map: vi.fn(() => ({})),
  })),
}));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: vi.fn(),
}));
vi.mock("ai", () => ({
  LoadAPIKeyError: { isInstance: vi.fn(() => false) },
  isToolUIPart: vi.fn((p: any) => p?.type === "tool-invocation"),
  getToolName: vi.fn((p: any) => p?.toolName ?? ""),
  jsonSchema: vi.fn((s: any) => s),
  tool: vi.fn((opts: any) => ({ ...opts, execute: undefined })),
}));

import { mergeSystemPrompt } from "./shared.chat";

describe("mergeSystemPrompt", () => {
  it("joins multiple prompts with double newline", () => {
    const result = mergeSystemPrompt("You are an AI assistant.", "Always respond in English.");
    expect(result).toBe("You are an AI assistant.\n\nAlways respond in English.");
  });

  it("filters out falsy values", () => {
    const result = mergeSystemPrompt("Base prompt", false, undefined, "Extra instructions");
    expect(result).toBe("Base prompt\n\nExtra instructions");
    expect(result).not.toContain("false");
    expect(result).not.toContain("undefined");
  });

  it("trims whitespace from each prompt", () => {
    const result = mergeSystemPrompt("  hello  ", "  world  ");
    expect(result).toBe("hello\n\nworld");
  });

  it("returns empty string for all falsy input", () => {
    expect(mergeSystemPrompt(false, undefined)).toBe("");
  });

  it("returns single prompt unchanged", () => {
    const result = mergeSystemPrompt("Only prompt");
    expect(result).toBe("Only prompt");
  });

  it("handles three or more prompts", () => {
    const result = mergeSystemPrompt("A", "B", "C");
    expect(result).toBe("A\n\nB\n\nC");
  });

  it("handles empty string inputs like falsy values", () => {
    const result = mergeSystemPrompt("Hello", "  ", "World");
    expect(result).not.toContain("  ");
  });

  it("returns single non-empty prompt as-is (no extra newlines)", () => {
    const result = mergeSystemPrompt("Only one prompt here");
    expect(result).toBe("Only one prompt here");
    expect(result).not.toContain("\n");
  });

  it("works with empty args list", () => {
    const result = mergeSystemPrompt();
    expect(result).toBe("");
  });

  it("maintains order of prompts", () => {
    const result = mergeSystemPrompt("First", "Second", "Third");
    const idx1 = result.indexOf("First");
    const idx2 = result.indexOf("Second");
    const idx3 = result.indexOf("Third");
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
  });

  it("uses double newline as separator (not single)", () => {
    const result = mergeSystemPrompt("A", "B");
    expect(result).toContain("\n\n");
    expect(result).not.toBe("A\nB");
  });

  it("result does not start with a newline", () => {
    const result = mergeSystemPrompt("Hello", "World");
    expect(result.startsWith("\n")).toBe(false);
  });

  it("result does not end with a newline", () => {
    const result = mergeSystemPrompt("Hello", "World");
    expect(result.endsWith("\n")).toBe(false);
  });

  it("tabs and newlines in input are trimmed away", () => {
    const result = mergeSystemPrompt("\t\tYou are helpful\t\t", "\n\nBe concise\n\n");
    expect(result).toBe("You are helpful\n\nBe concise");
  });

  it("all-whitespace strings are filtered out entirely", () => {
    const result = mergeSystemPrompt("   ", "  \t  ", "Real prompt");
    expect(result).toBe("Real prompt");
  });
});
