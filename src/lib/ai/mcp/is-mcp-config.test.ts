import { describe, expect, it } from "vitest";
import {
  isMaybeStdioConfig,
  isMaybeRemoteConfig,
  isMaybeMCPServerConfig,
} from "./is-mcp-config";

describe("isMaybeStdioConfig", () => {
  it("returns true for object with string command", () => {
    expect(isMaybeStdioConfig({ command: "node" })).toBe(true);
  });

  it("returns true with extra fields", () => {
    expect(isMaybeStdioConfig({ command: "python", args: ["-m", "mcp"] })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isMaybeStdioConfig(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMaybeStdioConfig(undefined)).toBe(false);
  });

  it("returns false for primitive string", () => {
    expect(isMaybeStdioConfig("command")).toBe(false);
  });

  it("returns false for number", () => {
    expect(isMaybeStdioConfig(42)).toBe(false);
  });

  it("returns false when command is missing", () => {
    expect(isMaybeStdioConfig({ url: "http://example.com" })).toBe(false);
  });

  it("returns false when command is not a string", () => {
    expect(isMaybeStdioConfig({ command: 123 })).toBe(false);
    expect(isMaybeStdioConfig({ command: null })).toBe(false);
    expect(isMaybeStdioConfig({ command: [] })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isMaybeStdioConfig({})).toBe(false);
  });
});

describe("isMaybeRemoteConfig", () => {
  it("returns true for object with string url", () => {
    expect(isMaybeRemoteConfig({ url: "http://localhost:8080/sse" })).toBe(true);
  });

  it("returns true with extra fields", () => {
    expect(isMaybeRemoteConfig({ url: "http://example.com", token: "abc" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isMaybeRemoteConfig(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMaybeRemoteConfig(undefined)).toBe(false);
  });

  it("returns false when url is missing", () => {
    expect(isMaybeRemoteConfig({ command: "node" })).toBe(false);
  });

  it("returns false when url is not a string", () => {
    expect(isMaybeRemoteConfig({ url: 42 })).toBe(false);
    expect(isMaybeRemoteConfig({ url: null })).toBe(false);
    expect(isMaybeRemoteConfig({ url: {} })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isMaybeRemoteConfig({})).toBe(false);
  });

  it("returns false for primitive", () => {
    expect(isMaybeRemoteConfig("http://example.com")).toBe(false);
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

  it("returns false for null", () => {
    expect(isMaybeMCPServerConfig(null)).toBe(false);
  });

  it("returns false for number", () => {
    expect(isMaybeMCPServerConfig(42)).toBe(false);
  });

  it("returns false for string", () => {
    expect(isMaybeMCPServerConfig("config")).toBe(false);
  });

  it("returns true when both url and command are present (union)", () => {
    // has command → stdio check passes first
    expect(isMaybeMCPServerConfig({ command: "node", url: "http://x.com" })).toBe(true);
  });
});

describe("isMaybeStdioConfig — return type invariants", () => {
  it("always returns a boolean", () => {
    const inputs = [null, undefined, {}, { command: "x" }, "str", 0, [], true];
    for (const input of inputs) {
      expect(typeof isMaybeStdioConfig(input)).toBe("boolean");
    }
  });
});

describe("isMaybeRemoteConfig — return type invariants", () => {
  it("always returns a boolean", () => {
    const inputs = [null, undefined, {}, { url: "x" }, "str", 0, [], true];
    for (const input of inputs) {
      expect(typeof isMaybeRemoteConfig(input)).toBe("boolean");
    }
  });
});

describe("isMaybeMCPServerConfig — return type invariants", () => {
  it("always returns a boolean", () => {
    const inputs = [null, undefined, {}, { command: "x" }, { url: "x" }, "str"];
    for (const input of inputs) {
      expect(typeof isMaybeMCPServerConfig(input)).toBe("boolean");
    }
  });

  it("is true iff at least one sub-guard is true", () => {
    const cases = [
      { input: { command: "x" }, expected: true },
      { input: { url: "x" }, expected: true },
      { input: {}, expected: false },
      { input: null, expected: false },
    ];
    for (const { input, expected } of cases) {
      expect(isMaybeMCPServerConfig(input)).toBe(expected);
    }
  });
});
