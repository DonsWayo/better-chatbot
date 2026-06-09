import { describe, it, expect } from "vitest";
import {
  MCPRemoteConfigZodSchema,
  MCPStdioConfigZodSchema,
  AllowedMCPServerZodSchema,
  McpToolCustomizationZodSchema,
  McpServerCustomizationZodSchema,
} from "./mcp";

describe("MCPRemoteConfigZodSchema", () => {
  it("accepts valid remote URL", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({ url: "https://mcp.example.com/sse" });
    expect(r.success).toBe(true);
  });

  it("rejects non-URL string", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({ url: "not-a-url" });
    expect(r.success).toBe(false);
  });

  it("accepts optional headers", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer token" },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.headers?.Authorization).toBe("Bearer token");
  });

  it("rejects missing url", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("MCPStdioConfigZodSchema", () => {
  it("accepts valid stdio config", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ command: "npx", args: ["-y", "@some/mcp"] });
    expect(r.success).toBe(true);
  });

  it("rejects empty command", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ command: "" });
    expect(r.success).toBe(false);
  });

  it("accepts config with env vars", () => {
    const r = MCPStdioConfigZodSchema.safeParse({
      command: "python",
      env: { MY_VAR: "value" },
    });
    expect(r.success).toBe(true);
  });

  it("args is optional", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ command: "node" });
    expect(r.success).toBe(true);
  });
});

describe("AllowedMCPServerZodSchema", () => {
  it("accepts valid allowed server config", () => {
    const r = AllowedMCPServerZodSchema.safeParse({ tools: ["search", "fetch"] });
    expect(r.success).toBe(true);
  });

  it("accepts empty tools array", () => {
    const r = AllowedMCPServerZodSchema.safeParse({ tools: [] });
    expect(r.success).toBe(true);
  });

  it("rejects missing tools", () => {
    const r = AllowedMCPServerZodSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("McpToolCustomizationZodSchema", () => {
  it("is a defined schema", () => {
    expect(McpToolCustomizationZodSchema).toBeDefined();
  });

  it("can be used for safeParse", () => {
    // Just verify the schema is parseable (structure varies)
    expect(typeof McpToolCustomizationZodSchema.safeParse).toBe("function");
  });
});

describe("McpServerCustomizationZodSchema", () => {
  it("is a defined schema", () => {
    expect(McpServerCustomizationZodSchema).toBeDefined();
  });

  it("can be used for safeParse", () => {
    expect(typeof McpServerCustomizationZodSchema.safeParse).toBe("function");
  });
});

describe("MCPRemoteConfigZodSchema — additional cases", () => {
  it("accepts http:// URL (not only https)", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({ url: "http://mcp.internal/sse" });
    expect(r.success).toBe(true);
  });

  it("rejects null as url", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({ url: null });
    expect(r.success).toBe(false);
  });
});

describe("MCPStdioConfigZodSchema — additional cases", () => {
  it("rejects missing command", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ args: ["--foo"] });
    expect(r.success).toBe(false);
  });

  it("accepts args as empty array", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ command: "node", args: [] });
    expect(r.success).toBe(true);
  });
});

describe("McpToolCustomizationZodSchema — field rules", () => {
  it("requires toolName (min 1)", () => {
    const r = McpToolCustomizationZodSchema.safeParse({ toolName: "", mcpServerId: "s1" });
    expect(r.success).toBe(false);
  });

  it("requires mcpServerId (min 1)", () => {
    const r = McpToolCustomizationZodSchema.safeParse({ toolName: "search", mcpServerId: "" });
    expect(r.success).toBe(false);
  });

  it("accepts null prompt", () => {
    const r = McpToolCustomizationZodSchema.safeParse({ toolName: "search", mcpServerId: "s1", prompt: null });
    expect(r.success).toBe(true);
  });

  it("accepts omitted prompt", () => {
    const r = McpToolCustomizationZodSchema.safeParse({ toolName: "search", mcpServerId: "s1" });
    expect(r.success).toBe(true);
  });

  it("rejects prompt over 1000 characters", () => {
    const r = McpToolCustomizationZodSchema.safeParse({
      toolName: "search", mcpServerId: "s1", prompt: "x".repeat(1001),
    });
    expect(r.success).toBe(false);
  });
});

describe("MCP schemas — additional invariants", () => {
  it("MCPStdioConfigZodSchema rejects empty command string", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ command: "", args: [] });
    expect(r.success).toBe(false);
  });

  it("MCPRemoteConfigZodSchema rejects non-http url", () => {
    const r = MCPRemoteConfigZodSchema.safeParse({ url: "ftp://example.com" });
    expect(r.success).toBe(false);
  });

  it("MCPStdioConfigZodSchema accepts valid command with args", () => {
    const r = MCPStdioConfigZodSchema.safeParse({ command: "node", args: ["server.js"] });
    expect(r.success).toBe(true);
  });

  it("McpServerCustomizationZodSchema rejects missing mcpServerId", () => {
    const r = McpServerCustomizationZodSchema.safeParse({ prompt: "help" });
    expect(r.success).toBe(false);
  });
});
