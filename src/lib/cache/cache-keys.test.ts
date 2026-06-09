import { describe, it, expect } from "vitest";
import { CacheKeys } from "./cache-keys";

describe("CacheKeys.thread", () => {
  it("prefixes thread id correctly", () => {
    expect(CacheKeys.thread("abc123")).toBe("thread-abc123");
  });

  it("handles UUID-style thread id", () => {
    const key = CacheKeys.thread("550e8400-e29b-41d4-a716-446655440000");
    expect(key).toBe("thread-550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("CacheKeys.user", () => {
  it("prefixes user id correctly", () => {
    expect(CacheKeys.user("user-1")).toBe("user-user-1");
  });

  it("handles empty user id", () => {
    expect(CacheKeys.user("")).toBe("user-");
  });
});

describe("CacheKeys.mcpServerCustomizations", () => {
  it("generates key with user id", () => {
    expect(CacheKeys.mcpServerCustomizations("team-42")).toBe(
      "mcp-server-customizations-team-42",
    );
  });
});

describe("CacheKeys.agentInstructions", () => {
  it("generates key with agent name", () => {
    expect(CacheKeys.agentInstructions("support-bot")).toBe(
      "agent-instructions-support-bot",
    );
  });

  it("handles UUID agent id", () => {
    const key = CacheKeys.agentInstructions("agt-001");
    expect(key).toContain("agent-instructions-agt-001");
  });
});

describe("CacheKeys — uniqueness", () => {
  it("different key types produce different prefixes", () => {
    const threadKey = CacheKeys.thread("123");
    const userKey = CacheKeys.user("123");
    expect(threadKey).not.toBe(userKey);
  });

  it("same type with different ids produce different keys", () => {
    expect(CacheKeys.thread("a")).not.toBe(CacheKeys.thread("b"));
  });
});
