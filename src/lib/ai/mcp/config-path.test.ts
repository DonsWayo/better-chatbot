import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { join } from "path";

describe("MCP_CONFIG_PATH", () => {
  const originalEnv = process.env.MCP_CONFIG_PATH;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    if (originalEnv === undefined) {
      delete process.env.MCP_CONFIG_PATH;
    } else {
      process.env.MCP_CONFIG_PATH = originalEnv;
    }
  });

  it("uses MCP_CONFIG_PATH env var when set", async () => {
    process.env.MCP_CONFIG_PATH = "/custom/path/.mcp-config.json";
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH).toBe("/custom/path/.mcp-config.json");
  });

  it("defaults to .mcp-config.json in cwd when env not set", async () => {
    delete process.env.MCP_CONFIG_PATH;
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH).toBe(join(process.cwd(), ".mcp-config.json"));
  });

  it("uses any string value from env var", async () => {
    process.env.MCP_CONFIG_PATH = "/tmp/mcp.json";
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH).toBe("/tmp/mcp.json");
  });

  it("default path ends with .mcp-config.json", async () => {
    delete process.env.MCP_CONFIG_PATH;
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH.endsWith(".mcp-config.json")).toBe(true);
  });

  it("default path contains the current working directory", async () => {
    delete process.env.MCP_CONFIG_PATH;
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH.startsWith(process.cwd())).toBe(true);
  });

  it("env var path is used verbatim (no normalization)", async () => {
    process.env.MCP_CONFIG_PATH = "/some/path/../config.json";
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH).toBe("/some/path/../config.json");
  });

  it("empty string env var falls back to default (falsy)", async () => {
    process.env.MCP_CONFIG_PATH = "";
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH).toBe(join(process.cwd(), ".mcp-config.json"));
  });

  it("result is a string", async () => {
    delete process.env.MCP_CONFIG_PATH;
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(typeof MCP_CONFIG_PATH).toBe("string");
  });

  it("env var set to relative path is used as-is", async () => {
    process.env.MCP_CONFIG_PATH = "./local-config.json";
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH).toBe("./local-config.json");
  });

  it("default path is an absolute path", async () => {
    delete process.env.MCP_CONFIG_PATH;
    const { MCP_CONFIG_PATH } = await import("./config-path");
    expect(MCP_CONFIG_PATH.startsWith("/")).toBe(true);
  });
});
