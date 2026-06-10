import { describe, expect, it } from "vitest";
import { CronError, computeNextRun, validateCronExpression } from "./cron";

// All expectations are exact UTC instants. Europe/London cases prove the
// Intl path: GMT in winter (UTC+0), BST in summer (UTC+1); DST switches on
// 2026-03-29 01:00 UTC (spring forward) and 2026-10-25 01:00 UTC (fall back).

describe("computeNextRun — UTC matrix", () => {
  it('"*/5 * * * *" rounds up to the next 5-minute boundary', () => {
    const next = computeNextRun(
      "*/5 * * * *",
      new Date("2026-06-10T12:03:20Z"),
    );
    expect(next.toISOString()).toBe("2026-06-10T12:05:00.000Z");
  });

  it('"*/5 * * * *" is strictly after `from` when `from` is on a boundary', () => {
    const next = computeNextRun(
      "*/5 * * * *",
      new Date("2026-06-10T12:05:00Z"),
    );
    expect(next.toISOString()).toBe("2026-06-10T12:10:00.000Z");
  });

  it('"0 9 * * 1" finds the next Monday 09:00', () => {
    // 2026-06-10 is a Wednesday → next Monday is 2026-06-15.
    const next = computeNextRun("0 9 * * 1", new Date("2026-06-10T10:00:00Z"));
    expect(next.toISOString()).toBe("2026-06-15T09:00:00.000Z");
    expect(next.getUTCDay()).toBe(1);
  });

  it('"0 9 * * 1" on a Monday before 09:00 fires the same day', () => {
    // 2026-06-15 is a Monday.
    const next = computeNextRun("0 9 * * 1", new Date("2026-06-15T08:30:00Z"));
    expect(next.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it('"30 8 1 * *" fires on the 1st of the next month', () => {
    const next = computeNextRun("30 8 1 * *", new Date("2026-06-10T00:00:00Z"));
    expect(next.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it('"30 8 1 * *" crosses a year boundary', () => {
    const next = computeNextRun("30 8 1 * *", new Date("2026-12-15T00:00:00Z"));
    expect(next.toISOString()).toBe("2027-01-01T08:30:00.000Z");
  });

  it('"0 0 * * 7" treats 7 as Sunday (same as 0)', () => {
    // 2026-06-14 is a Sunday.
    const next = computeNextRun("0 0 * * 7", new Date("2026-06-10T12:00:00Z"));
    expect(next.toISOString()).toBe("2026-06-14T00:00:00.000Z");
    expect(next.getUTCDay()).toBe(0);
  });

  it("restricted dom AND dow match as OR (vixie semantics)", () => {
    // "0 0 13 * 5" = midnight on the 13th OR on any Friday.
    // From 2026-06-10 (Wed): Friday 2026-06-12 comes before the 13th.
    const next = computeNextRun("0 0 13 * 5", new Date("2026-06-10T12:00:00Z"));
    expect(next.toISOString()).toBe("2026-06-12T00:00:00.000Z");
  });

  it("UTC is DST-free: daily 01:30 fires at 01:30 UTC across the March DST weekend", () => {
    const next = computeNextRun(
      "30 1 * * *",
      new Date("2026-03-28T02:00:00Z"),
      "UTC",
    );
    expect(next.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("handles ranges with steps and lists combined", () => {
    // minutes 0,15,30,45 via range/step + hour list.
    const next = computeNextRun(
      "0-59/15 9,18 * * *",
      new Date("2026-06-10T09:20:00Z"),
    );
    expect(next.toISOString()).toBe("2026-06-10T09:30:00.000Z");
  });
});

describe("computeNextRun — Europe/London (Intl path)", () => {
  it("winter (GMT): 09:00 wall = 09:00 UTC", () => {
    const next = computeNextRun(
      "0 9 * * *",
      new Date("2026-01-10T10:00:00Z"),
      "Europe/London",
    );
    expect(next.toISOString()).toBe("2026-01-11T09:00:00.000Z");
  });

  it("summer (BST): 09:00 wall = 08:00 UTC", () => {
    const next = computeNextRun(
      "0 9 * * *",
      new Date("2026-06-10T10:00:00Z"),
      "Europe/London",
    );
    expect(next.toISOString()).toBe("2026-06-11T08:00:00.000Z");
  });

  it("spring forward: 09:00 on transition day fires at 08:00 UTC", () => {
    // 2026-03-29 01:00 UTC clocks jump 01:00→02:00; 09:00 BST = 08:00 UTC.
    const next = computeNextRun(
      "0 9 * * *",
      new Date("2026-03-28T10:00:00Z"),
      "Europe/London",
    );
    expect(next.toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("spring forward: a wall time skipped by DST (01:30) does not fire that day", () => {
    // 01:30 wall does not exist on 2026-03-29 → next fire is Mar 30
    // 01:30 BST = 00:30 UTC.
    const next = computeNextRun(
      "30 1 * * *",
      new Date("2026-03-28T02:00:00Z"),
      "Europe/London",
    );
    expect(next.toISOString()).toBe("2026-03-30T00:30:00.000Z");
  });

  it("fall back: a repeated wall time (01:30) fires on its first (BST) occurrence", () => {
    // 2026-10-25: 02:00 BST → 01:00 GMT; 01:30 occurs twice. First
    // occurrence is 01:30 BST = 00:30 UTC.
    const next = computeNextRun(
      "30 1 * * *",
      new Date("2026-10-24T12:00:00Z"),
      "Europe/London",
    );
    expect(next.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("weekly Monday 09:00 across the spring transition", () => {
    // Next Monday after 2026-03-28 (Sat) is 2026-03-30, already BST.
    const next = computeNextRun(
      "0 9 * * 1",
      new Date("2026-03-28T12:00:00Z"),
      "Europe/London",
    );
    expect(next.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });
});

describe("computeNextRun / validateCronExpression — invalid input", () => {
  it.each([
    ["* * * *", "4 fields"],
    ["* * * * * *", "6 fields"],
    ["60 * * * *", "minute 60"],
    ["* 24 * * *", "hour 24"],
    ["* * 0 * *", "day-of-month 0"],
    ["* * 32 * *", "day-of-month 32"],
    ["* * * 13 *", "month 13"],
    ["* * * * 8", "day-of-week 8"],
    ["a * * * *", "non-numeric"],
    ["*/0 * * * *", "step 0"],
    ["5-1 * * * *", "reversed range"],
    ["1,,2 * * * *", "empty list item"],
    ["1//2 * * * *", "double step"],
    ["-5 * * * *", "negative-looking value"],
    ["", "empty expression"],
  ])("throws CronError for %s (%s)", (expr) => {
    expect(() => validateCronExpression(expr)).toThrow(CronError);
    expect(() => computeNextRun(expr, new Date())).toThrow(CronError);
  });

  it("throws CronError for an invalid timezone", () => {
    expect(() => computeNextRun("* * * * *", new Date(), "Not/AZone")).toThrow(
      CronError,
    );
  });

  it("throws CronError when the expression never fires (Feb 31)", () => {
    expect(() =>
      computeNextRun("0 0 31 2 *", new Date("2026-06-10T00:00:00Z")),
    ).toThrow(CronError);
  });

  it("accepts every valid edge value", () => {
    expect(() => validateCronExpression("59 23 31 12 7")).not.toThrow();
    expect(() => validateCronExpression("0 0 1 1 0")).not.toThrow();
    expect(() => validateCronExpression("*/1 * * * *")).not.toThrow();
  });
});
