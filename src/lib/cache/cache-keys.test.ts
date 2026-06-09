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

  it("all four key types are mutually distinct for same id", () => {
    const id = "same-id";
    const keys = [
      CacheKeys.thread(id),
      CacheKeys.user(id),
      CacheKeys.mcpServerCustomizations(id),
      CacheKeys.agentInstructions(id),
    ];
    const unique = new Set(keys);
    expect(unique.size).toBe(4);
  });
});

describe("CacheKeys — key structure", () => {
  it("all keys are non-empty strings", () => {
    expect(typeof CacheKeys.thread("x")).toBe("string");
    expect(CacheKeys.thread("x").length).toBeGreaterThan(0);
    expect(typeof CacheKeys.user("x")).toBe("string");
    expect(CacheKeys.user("x").length).toBeGreaterThan(0);
    expect(typeof CacheKeys.mcpServerCustomizations("x")).toBe("string");
    expect(CacheKeys.mcpServerCustomizations("x").length).toBeGreaterThan(0);
    expect(typeof CacheKeys.agentInstructions("x")).toBe("string");
    expect(CacheKeys.agentInstructions("x").length).toBeGreaterThan(0);
  });

  it("each key includes the id as a substring", () => {
    const id = "test-id-99";
    expect(CacheKeys.thread(id)).toContain(id);
    expect(CacheKeys.user(id)).toContain(id);
    expect(CacheKeys.mcpServerCustomizations(id)).toContain(id);
    expect(CacheKeys.agentInstructions(id)).toContain(id);
  });

  it("keys are deterministic — same input always returns same key", () => {
    const id = "stable-id";
    expect(CacheKeys.thread(id)).toBe(CacheKeys.thread(id));
    expect(CacheKeys.user(id)).toBe(CacheKeys.user(id));
    expect(CacheKeys.mcpServerCustomizations(id)).toBe(CacheKeys.mcpServerCustomizations(id));
    expect(CacheKeys.agentInstructions(id)).toBe(CacheKeys.agentInstructions(id));
  });
});

describe("CacheKeys — additional id formats", () => {
  it("mcpServerCustomizations with UUID-style id", () => {
    const key = CacheKeys.mcpServerCustomizations("550e8400-e29b-41d4-a716-446655440000");
    expect(key).toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(key.startsWith("mcp-server-customizations-")).toBe(true);
  });

  it("user key with email-style id", () => {
    const key = CacheKeys.user("user@example.com");
    expect(key).toBe("user-user@example.com");
  });

  it("thread key with long numeric id", () => {
    const key = CacheKeys.thread("123456789012345678901234567890");
    expect(key).toBe("thread-123456789012345678901234567890");
  });

  it("agentInstructions with hyphenated name", () => {
    const key = CacheKeys.agentInstructions("my-support-bot");
    expect(key).toBe("agent-instructions-my-support-bot");
  });
});
