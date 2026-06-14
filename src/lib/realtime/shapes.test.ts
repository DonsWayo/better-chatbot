import { describe, expect, it } from "vitest";
import {
  PRESENCE_ACTIVE_WINDOW_MS,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  TYPING_BEAT_THROTTLE_MS,
  TYPING_DISPLAY_WINDOW_MS,
  TYPING_SILENCE_CLEAR_MS,
  WHITELISTED_SHAPE_TABLES,
  isPresenceContextType,
  isUuid,
  isWhitelistedShapeTable,
  shouldSendTypingBeat,
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

// The throttle helper IS the gate the typing beacon (use-typing-beacon.ts)
// consults before each heartbeat(typing=true). Regression guard for the
// "typing stuck false" bug: the first keystroke MUST beat, otherwise
// asafe_presence.typing never flips to true.
describe("shouldSendTypingBeat", () => {
  it("beats on the very first keystroke (no prior beat recorded)", () => {
    expect(shouldSendTypingBeat(1_000, null)).toBe(true);
  });

  it("suppresses beats inside the throttle window, allows them after", () => {
    const last = 1_000;
    expect(shouldSendTypingBeat(last + 1, last)).toBe(false);
    expect(shouldSendTypingBeat(last + TYPING_BEAT_THROTTLE_MS - 1, last)).toBe(
      false,
    );
    // Exactly one throttle window later, the next beat is allowed.
    expect(shouldSendTypingBeat(last + TYPING_BEAT_THROTTLE_MS, last)).toBe(
      true,
    );
  });

  it("keeps the typing windows correctly ordered so the indicator behaves", () => {
    // A beat at most every 4s must land inside the 5s silence-clear window,
    // which in turn must land inside the 10s reader display window — otherwise
    // a still-typing user would flicker to "not typing".
    expect(TYPING_BEAT_THROTTLE_MS).toBeLessThan(TYPING_SILENCE_CLEAR_MS);
    expect(TYPING_SILENCE_CLEAR_MS).toBeLessThan(TYPING_DISPLAY_WINDOW_MS);
  });
});
