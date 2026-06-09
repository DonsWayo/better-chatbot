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
});
