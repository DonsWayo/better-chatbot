import { describe, expect, it } from "vitest";
import {
  MCPRemoteConfigZodSchema,
  MCPStdioConfigZodSchema,
  AllowedMCPServerZodSchema,
} from "./mcp";

describe("MCPRemoteConfigZodSchema", () => {
  it("accepts valid remote config", () => {
    const result = MCPRemoteConfigZodSchema.safeParse({ url: "https://example.com/sse" });
    expect(result.success).toBe(true);
  });

  it("accepts optional headers", () => {
    const result = MCPRemoteConfigZodSchema.safeParse({
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer token" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-URL string", () => {
    expect(MCPRemoteConfigZodSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });

  it("rejects missing url", () => {
    expect(MCPRemoteConfigZodSchema.safeParse({}).success).toBe(false);
  });

  it("rejects numeric url", () => {
    expect(MCPRemoteConfigZodSchema.safeParse({ url: 42 }).success).toBe(false);
  });

  it("rejects non-string header values", () => {
    expect(
      MCPRemoteConfigZodSchema.safeParse({
        url: "https://x.com",
        headers: { key: 123 },
      }).success,
    ).toBe(false);
  });
});

describe("MCPStdioConfigZodSchema", () => {
  it("accepts valid stdio config", () => {
    const result = MCPStdioConfigZodSchema.safeParse({ command: "node" });
    expect(result.success).toBe(true);
  });

  it("accepts optional args array", () => {
    const result = MCPStdioConfigZodSchema.safeParse({ command: "python", args: ["-m", "mcp"] });
    expect(result.success).toBe(true);
  });

  it("accepts optional env record", () => {
    const result = MCPStdioConfigZodSchema.safeParse({
      command: "node",
      env: { MCP_DEBUG: "true" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty command string", () => {
    expect(MCPStdioConfigZodSchema.safeParse({ command: "" }).success).toBe(false);
  });

  it("rejects missing command", () => {
    expect(MCPStdioConfigZodSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-string command", () => {
    expect(MCPStdioConfigZodSchema.safeParse({ command: 42 }).success).toBe(false);
  });

  it("rejects non-array args", () => {
    expect(MCPStdioConfigZodSchema.safeParse({ command: "node", args: "arg" }).success).toBe(false);
  });
});

describe("AllowedMCPServerZodSchema", () => {
  it("accepts valid allowed server config", () => {
    const result = AllowedMCPServerZodSchema.safeParse({ tools: ["tool1", "tool2"] });
    expect(result.success).toBe(true);
  });

  it("accepts empty tools array", () => {
    expect(AllowedMCPServerZodSchema.safeParse({ tools: [] }).success).toBe(true);
  });

  it("rejects missing tools", () => {
    expect(AllowedMCPServerZodSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-array tools", () => {
    expect(AllowedMCPServerZodSchema.safeParse({ tools: "tool" }).success).toBe(false);
  });

  it("rejects tools containing non-strings", () => {
    expect(AllowedMCPServerZodSchema.safeParse({ tools: [1, 2] }).success).toBe(false);
  });
});

describe("MCP schemas — return type invariants", () => {
  it("MCPRemoteConfigZodSchema parsed result has url", () => {
    const result = MCPRemoteConfigZodSchema.safeParse({ url: "http://x.com" });
    if (result.success) {
      expect(typeof result.data.url).toBe("string");
    }
  });

  it("MCPStdioConfigZodSchema parsed result has command", () => {
    const result = MCPStdioConfigZodSchema.safeParse({ command: "node" });
    if (result.success) {
      expect(typeof result.data.command).toBe("string");
    }
  });

  it("AllowedMCPServerZodSchema parsed result has tools array", () => {
    const result = AllowedMCPServerZodSchema.safeParse({ tools: ["x"] });
    if (result.success) {
      expect(Array.isArray(result.data.tools)).toBe(true);
    }
  });
});
