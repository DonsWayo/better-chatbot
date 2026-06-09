import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { toolCall: vi.fn() },
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectExecuteAbility: vi.fn() },
}));
vi.mock("lib/ai/tools/tool-kit", () => ({
  APP_DEFAULT_TOOL_KIT: {},
}));
vi.mock("logger", () => ({
  default: { error: vi.fn(), withDefaults: () => ({ error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: vi.fn(),
}));
vi.mock("ai", () => ({
  LoadAPIKeyError: class LoadAPIKeyError extends Error {
    static isInstance(e: unknown) {
      return e instanceof LoadAPIKeyError;
    }
  },
  isToolUIPart: (p: { type?: string }) => p?.type === "tool-invocation",
  tool: vi.fn((opts: unknown) => opts),
  jsonSchema: vi.fn((s: unknown) => s),
  getToolName: (part: { toolName?: string }) => part.toolName ?? "",
}));
vi.mock("ts-safe", () => ({
  safe: (v: unknown) => ({
    map: (fn: (v: unknown) => unknown) => {
      const result = fn(v);
      return {
        map: (fn2: (v: unknown) => unknown) => ({
          unwrap: () => fn2(result),
          ifFail: () => ({ unwrap: () => fn2(result) }),
        }),
        ifFail: () => ({ unwrap: () => result }),
        unwrap: () => result,
      };
    },
    unwrap: () => v,
  }),
  errorIf: vi.fn(),
}));

import {
  mergeSystemPrompt,
  filterMCPToolsByMentions,
  filterMCPToolsByAllowedMCPServers,
  filterMcpServerCustomizations,
  extractInProgressToolPart,
  handleError,
} from "./shared.chat";
import type { VercelAIMcpTool } from "app-types/mcp";
import type { ChatMention } from "app-types/chat";
import type { UIMessage } from "ai";

// helper to make a minimal VercelAIMcpTool
const makeMcpTool = (
  id: string,
  serverId: string,
  originName: string,
): VercelAIMcpTool =>
  ({
    _mcpServerName: `server-${serverId}`,
    _mcpServerId: serverId,
    _originToolName: originName,
    inputSchema: { type: "object", properties: {} },
    description: `Tool ${id}`,
    execute: vi.fn(),
  }) as unknown as VercelAIMcpTool;

describe("mergeSystemPrompt", () => {
  it("merges two non-empty prompts with double newline", () => {
    const result = mergeSystemPrompt("Prompt A", "Prompt B");
    expect(result).toBe("Prompt A\n\nPrompt B");
  });

  it("filters out falsy values", () => {
    const result = mergeSystemPrompt("A", undefined, false, "B");
    expect(result).toBe("A\n\nB");
  });

  it("returns empty string when all prompts are falsy", () => {
    const result = mergeSystemPrompt(undefined, false);
    expect(result).toBe("");
  });

  it("trims whitespace from each prompt", () => {
    const result = mergeSystemPrompt("  A  ", "  B  ");
    expect(result).toBe("A\n\nB");
  });

  it("returns single prompt unchanged", () => {
    const result = mergeSystemPrompt("Only one");
    expect(result).toBe("Only one");
  });

  it("handles empty string (falsy) among prompts", () => {
    const result = mergeSystemPrompt("A", "");
    expect(result).toBe("A");
  });
});

describe("filterMCPToolsByMentions", () => {
  const toolA = makeMcpTool("a", "server-1", "toolA");
  const toolB = makeMcpTool("b", "server-1", "toolB");
  const toolC = makeMcpTool("c", "server-2", "toolC");
  const tools = { toolA, toolB, toolC };

  it("returns all tools when mentions is empty", () => {
    const result = filterMCPToolsByMentions(tools, []);
    expect(Object.keys(result)).toEqual(["toolA", "toolB", "toolC"]);
  });

  it("filters to specific tool when mcpTool mention provided", () => {
    const mentions: ChatMention[] = [
      { type: "mcpTool", serverId: "server-1", name: "toolA" },
    ];
    const result = filterMCPToolsByMentions(tools, mentions);
    expect(Object.keys(result)).toContain("toolA");
    expect(Object.keys(result)).not.toContain("toolB");
    expect(Object.keys(result)).not.toContain("toolC");
  });

  it("returns all tools from server when mcpServer mention provided", () => {
    const mentions: ChatMention[] = [
      { type: "mcpServer", serverId: "server-1" },
    ];
    const result = filterMCPToolsByMentions(tools, mentions);
    expect(Object.keys(result)).toContain("toolA");
    expect(Object.keys(result)).toContain("toolB");
    expect(Object.keys(result)).not.toContain("toolC");
  });

  it("filters to empty when no mentions match any tool", () => {
    const mentions: ChatMention[] = [
      { type: "mcpTool", serverId: "server-99", name: "nonexistent" },
    ];
    const result = filterMCPToolsByMentions(tools, mentions);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("ignores non-mcp mention types for filtering", () => {
    const mentions: ChatMention[] = [
      { type: "agent", agentId: "ag-1" },
    ];
    // No mcpTool/mcpServer mentions → but mentions is not empty so filtering applies
    // with no matching server mentions, result should be empty
    const result = filterMCPToolsByMentions(tools, mentions);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("filterMCPToolsByAllowedMCPServers", () => {
  const toolA = makeMcpTool("a", "server-1", "toolA");
  const toolB = makeMcpTool("b", "server-1", "toolB");
  const toolC = makeMcpTool("c", "server-2", "toolC");
  const tools = { toolA, toolB, toolC };

  it("returns empty object when no allowedMcpServers", () => {
    const result = filterMCPToolsByAllowedMCPServers(tools);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns empty object when allowedMcpServers is empty", () => {
    const result = filterMCPToolsByAllowedMCPServers(tools, {});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("filters to tools listed in allowedMcpServers", () => {
    const result = filterMCPToolsByAllowedMCPServers(tools, {
      "server-1": { tools: ["toolA"] },
    });
    expect(Object.keys(result)).toContain("toolA");
    expect(Object.keys(result)).not.toContain("toolB");
    expect(Object.keys(result)).not.toContain("toolC");
  });

  it("includes tools from multiple servers", () => {
    const result = filterMCPToolsByAllowedMCPServers(tools, {
      "server-1": { tools: ["toolA"] },
      "server-2": { tools: ["toolC"] },
    });
    expect(Object.keys(result)).toContain("toolA");
    expect(Object.keys(result)).toContain("toolC");
    expect(Object.keys(result)).not.toContain("toolB");
  });
});

describe("filterMcpServerCustomizations", () => {
  const toolA = makeMcpTool("a", "server-1", "toolA");
  const tools = { toolA };

  it("returns empty object when no matching tools for server", () => {
    const result = filterMcpServerCustomizations(tools, {
      "server-99": { id: "server-99", name: "Other", prompt: "Some prompt" },
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns customization for server with matching tools", () => {
    const result = filterMcpServerCustomizations(tools, {
      "server-1": { id: "server-1", name: "Server 1", prompt: "Be helpful" },
    });
    expect(result["server-1"]).toBeDefined();
    expect(result["server-1"].prompt).toBe("Be helpful");
  });

  it("excludes servers with no prompt and no tools customization", () => {
    const result = filterMcpServerCustomizations(tools, {
      "server-1": { id: "server-1", name: "Server 1" },
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("filters tool customizations to only tools present in tools object", () => {
    const result = filterMcpServerCustomizations(tools, {
      "server-1": {
        id: "server-1",
        name: "Server 1",
        prompt: "prompt",
        tools: { toolA: "Do A", toolB: "Do B (not present)" },
      },
    });
    expect(result["server-1"].tools).toHaveProperty("toolA");
    expect(result["server-1"].tools).not.toHaveProperty("toolB");
  });
});

describe("extractInProgressToolPart", () => {
  it("returns empty array for user messages", () => {
    const message = {
      role: "user",
      parts: [{ type: "tool-invocation", state: "output-available", output: { _tag: "manual-confirm", confirm: true }, toolName: "t", toolCallId: "1", input: {} }],
      metadata: { toolChoice: "manual" },
    } as unknown as UIMessage;
    const result = extractInProgressToolPart(message);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when toolChoice is not manual", () => {
    const message = {
      role: "assistant",
      parts: [{ type: "tool-invocation", state: "output-available", output: { _tag: "manual-confirm", confirm: true }, toolName: "t", toolCallId: "1", input: {} }],
      metadata: { toolChoice: "auto" },
    } as unknown as UIMessage;
    const result = extractInProgressToolPart(message);
    expect(result).toHaveLength(0);
  });
});

describe("handleError", () => {
  it("returns a string for generic errors", () => {
    const result = handleError(new Error("generic error"));
    expect(typeof result).toBe("string");
  });

  it("returns a string for Error with message", () => {
    const result = handleError({ message: "something went wrong", name: "Error" });
    expect(typeof result).toBe("string");
  });
});
