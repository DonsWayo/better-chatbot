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
