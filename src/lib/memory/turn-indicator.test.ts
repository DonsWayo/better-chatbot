import { describe, expect, it } from "vitest";
import {
  MEMORY_CHECK_DELAYS_MS,
  countNewMemories,
  isTurnActiveStatus,
  turnJustCompleted,
} from "./turn-indicator";

describe("MEMORY_CHECK_DELAYS_MS", () => {
  it("is exactly two attempts (4s, 10s) — no polling loops", () => {
    expect(MEMORY_CHECK_DELAYS_MS).toEqual([4_000, 10_000]);
  });
});

describe("isTurnActiveStatus", () => {
  it("treats submitted and streaming as in-flight", () => {
    expect(isTurnActiveStatus("submitted")).toBe(true);
    expect(isTurnActiveStatus("streaming")).toBe(true);
  });

  it("treats ready/error/unknown as not in-flight", () => {
    expect(isTurnActiveStatus("ready")).toBe(false);
    expect(isTurnActiveStatus("error")).toBe(false);
    expect(isTurnActiveStatus("")).toBe(false);
  });
});

describe("turnJustCompleted", () => {
  it("fires on streaming → ready and submitted → ready", () => {
    expect(turnJustCompleted("streaming", "ready")).toBe(true);
    expect(turnJustCompleted("submitted", "ready")).toBe(true);
  });

  it("does not fire on error endings or non-transitions", () => {
    expect(turnJustCompleted("streaming", "error")).toBe(false);
    expect(turnJustCompleted("ready", "ready")).toBe(false);
    expect(turnJustCompleted("error", "ready")).toBe(false);
    expect(turnJustCompleted("submitted", "streaming")).toBe(false);
  });
});

describe("countNewMemories", () => {
  it("counts the memories array in a route payload", () => {
    expect(countNewMemories({ memories: [{ id: "m1" }, { id: "m2" }] })).toBe(
      2,
    );
    expect(countNewMemories({ memories: [] })).toBe(0);
  });

  it("is defensive about malformed payloads", () => {
    expect(countNewMemories(null)).toBe(0);
    expect(countNewMemories(undefined)).toBe(0);
    expect(countNewMemories("nope")).toBe(0);
    expect(countNewMemories({})).toBe(0);
    expect(countNewMemories({ memories: "not-an-array" })).toBe(0);
  });
});
