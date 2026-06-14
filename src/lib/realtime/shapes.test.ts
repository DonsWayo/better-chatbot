import { describe, expect, it } from "vitest";
import {
  PRESENCE_ACTIVE_WINDOW_MS,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  WHITELISTED_SHAPE_TABLES,
  isPresenceContextType,
  isUuid,
  isWhitelistedShapeTable,
} from "./shapes";

describe("shape whitelist", () => {
  it("serves exactly the four known shapes", () => {
    expect(WHITELISTED_SHAPE_TABLES).toEqual([
      "chat_message",
      "agent_session",
      "asafe_presence",
      "document",
    ]);
  });

  it("accepts whitelisted tables and rejects everything else", () => {
    expect(isWhitelistedShapeTable("asafe_presence")).toBe(true);
    expect(isWhitelistedShapeTable("chat_message")).toBe(true);
    expect(isWhitelistedShapeTable("user")).toBe(false);
    expect(isWhitelistedShapeTable("")).toBe(false);
    expect(isWhitelistedShapeTable(null)).toBe(false);
  });
});

describe("presence context types", () => {
  it("accepts thread, folder and document only", () => {
    expect(isPresenceContextType("thread")).toBe(true);
    expect(isPresenceContextType("folder")).toBe(true);
    expect(isPresenceContextType("document")).toBe(true);
    expect(isPresenceContextType("workspace")).toBe(false);
    expect(isPresenceContextType("")).toBe(false);
    expect(isPresenceContextType(null)).toBe(false);
  });

  it("keeps the active window comfortably wider than the heartbeat", () => {
    // Two missed heartbeats max before a user fades out (30s beat, 90s window).
    expect(PRESENCE_ACTIVE_WINDOW_MS).toBeGreaterThan(
      PRESENCE_HEARTBEAT_INTERVAL_MS * 2,
    );
  });
});

describe("isUuid", () => {
  it("validates context ids", () => {
    expect(isUuid("11111111-2222-4333-8444-555555555555")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
