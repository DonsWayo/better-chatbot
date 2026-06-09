import { describe, expect, it } from "vitest";
import { CacheKeys } from "./cache-keys";

describe("CacheKeys", () => {
  it("is an object", () => {
    expect(typeof CacheKeys).toBe("object");
    expect(CacheKeys).not.toBeNull();
  });

  it("thread returns key containing the threadId", () => {
    expect(CacheKeys.thread("abc-123")).toContain("abc-123");
  });

  it("user returns key containing the userId", () => {
    expect(CacheKeys.user("user-456")).toContain("user-456");
  });

  it("mcpServerCustomizations returns key containing the userId", () => {
    expect(CacheKeys.mcpServerCustomizations("uid-1")).toContain("uid-1");
  });

  it("agentInstructions returns key containing the agent", () => {
    expect(CacheKeys.agentInstructions("agent-007")).toContain("agent-007");
  });
});

describe("CacheKeys — return type invariants", () => {
  it("all functions return strings", () => {
    expect(typeof CacheKeys.thread("t")).toBe("string");
    expect(typeof CacheKeys.user("u")).toBe("string");
    expect(typeof CacheKeys.mcpServerCustomizations("u")).toBe("string");
    expect(typeof CacheKeys.agentInstructions("a")).toBe("string");
  });

  it("different ids produce different keys", () => {
    expect(CacheKeys.thread("a")).not.toBe(CacheKeys.thread("b"));
    expect(CacheKeys.user("a")).not.toBe(CacheKeys.user("b"));
  });

  it("same id always produces same key (pure/deterministic)", () => {
    expect(CacheKeys.thread("x")).toBe(CacheKeys.thread("x"));
    expect(CacheKeys.user("x")).toBe(CacheKeys.user("x"));
  });
});

describe("CacheKeys — namespace isolation", () => {
  it("thread and user keys differ for the same id", () => {
    expect(CacheKeys.thread("same-id")).not.toBe(CacheKeys.user("same-id"));
  });

  it("thread and mcpServerCustomizations keys differ", () => {
    expect(CacheKeys.thread("id")).not.toBe(CacheKeys.mcpServerCustomizations("id"));
  });

  it("all four keys are unique for the same id", () => {
    const keys = [
      CacheKeys.thread("id"),
      CacheKeys.user("id"),
      CacheKeys.mcpServerCustomizations("id"),
      CacheKeys.agentInstructions("id"),
    ];
    expect(new Set(keys).size).toBe(4);
  });
});

describe("CacheKeys — edge cases", () => {
  it("handles empty string id", () => {
    const key = CacheKeys.thread("");
    expect(typeof key).toBe("string");
  });

  it("handles special chars in id", () => {
    const key = CacheKeys.user("user/with/slashes");
    expect(key).toContain("user/with/slashes");
  });
});
