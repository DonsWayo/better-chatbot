import { describe, it, expect } from "vitest";
import { CacheKeys } from "./cache-keys";

describe("CacheKeys", () => {
  it("thread key includes threadId", () => {
    expect(CacheKeys.thread("t-123")).toBe("thread-t-123");
  });

  it("user key includes userId", () => {
    expect(CacheKeys.user("u-456")).toBe("user-u-456");
  });

  it("mcpServerCustomizations key includes userId", () => {
    expect(CacheKeys.mcpServerCustomizations("u-789")).toBe(
      "mcp-server-customizations-u-789",
    );
  });

  it("agentInstructions key includes agent name", () => {
    expect(CacheKeys.agentInstructions("my-agent")).toBe(
      "agent-instructions-my-agent",
    );
  });

  it("different user IDs produce different keys", () => {
    expect(CacheKeys.user("u-1")).not.toBe(CacheKeys.user("u-2"));
  });

  it("different resource types produce different namespaces", () => {
    const threadKey = CacheKeys.thread("same-id");
    const userKey = CacheKeys.user("same-id");
    expect(threadKey).not.toBe(userKey);
  });
});
