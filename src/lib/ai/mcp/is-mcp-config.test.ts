import { describe, it, expect } from "vitest";
import { isMaybeStdioConfig, isMaybeRemoteConfig, isMaybeMCPServerConfig } from "./is-mcp-config";

describe("isMaybeStdioConfig", () => {
  it("returns true for object with string command", () => {
    expect(isMaybeStdioConfig({ command: "npx", args: ["-y", "server"] })).toBe(true);
    expect(isMaybeStdioConfig({ command: "/usr/bin/node" })).toBe(true);
  });

  it("returns false when command is missing", () => {
    expect(isMaybeStdioConfig({ url: "http://mcp.example.com" })).toBe(false);
    expect(isMaybeStdioConfig({})).toBe(false);
  });

  it("returns false when command is not a string", () => {
    expect(isMaybeStdioConfig({ command: 42 })).toBe(false);
    expect(isMaybeStdioConfig({ command: null })).toBe(false);
  });

  it("returns false for null/non-object", () => {
    expect(isMaybeStdioConfig(null)).toBe(false);
    expect(isMaybeStdioConfig("command")).toBe(false);
    expect(isMaybeStdioConfig(undefined)).toBe(false);
  });
});

describe("isMaybeRemoteConfig", () => {
  it("returns true for object with string url", () => {
    expect(isMaybeRemoteConfig({ url: "http://mcp.example.com" })).toBe(true);
    expect(isMaybeRemoteConfig({ url: "https://api.example.com/mcp", type: "sse" })).toBe(true);
  });

  it("returns false when url is missing", () => {
    expect(isMaybeRemoteConfig({ command: "npx" })).toBe(false);
    expect(isMaybeRemoteConfig({})).toBe(false);
  });

  it("returns false when url is not a string", () => {
    expect(isMaybeRemoteConfig({ url: 42 })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isMaybeRemoteConfig(null)).toBe(false);
    expect(isMaybeRemoteConfig(undefined)).toBe(false);
  });
});

describe("isMaybeMCPServerConfig", () => {
  it("returns true for stdio config", () => {
    expect(isMaybeMCPServerConfig({ command: "node" })).toBe(true);
  });

  it("returns true for remote config", () => {
    expect(isMaybeMCPServerConfig({ url: "http://example.com" })).toBe(true);
  });

  it("returns false for empty object", () => {
    expect(isMaybeMCPServerConfig({})).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isMaybeMCPServerConfig(null)).toBe(false);
    expect(isMaybeMCPServerConfig(42)).toBe(false);
  });
});
