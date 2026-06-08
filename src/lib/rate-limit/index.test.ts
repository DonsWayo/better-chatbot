import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "./index";

// Access the internal buckets map to manipulate time via Date.now mocking.
// We reset the module between suites where needed to get a fresh Map.

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("first call is allowed and remaining equals limit minus 1", () => {
    vi.setSystemTime(1_000_000);

    const result = checkRateLimit("user-first-call", 10, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.resetAt).toBe(1_000_000 + 60_000);
  });

  it("calls up to the limit are all allowed", () => {
    vi.setSystemTime(2_000_000);
    const limit = 5;

    for (let i = 1; i <= limit; i++) {
      const result = checkRateLimit("user-up-to-limit", limit, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("call at limit+1 is NOT allowed and remaining is 0", () => {
    vi.setSystemTime(3_000_000);
    const limit = 3;

    // exhaust the limit
    for (let i = 0; i < limit; i++) {
      checkRateLimit("user-over-limit", limit, 60_000);
    }

    // one over
    const result = checkRateLimit("user-over-limit", limit, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("after window expires the bucket resets and the next call is allowed again", () => {
    const windowMs = 60_000;
    vi.setSystemTime(4_000_000);

    // exhaust the limit
    const limit = 2;
    for (let i = 0; i < limit + 1; i++) {
      checkRateLimit("user-window-reset", limit, windowMs);
    }

    // Advance time past the window
    vi.setSystemTime(4_000_000 + windowMs + 1);

    const result = checkRateLimit("user-window-reset", limit, windowMs);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });

  it("different userIds have isolated buckets", () => {
    vi.setSystemTime(5_000_000);
    const limit = 2;

    // exhaust user-a
    for (let i = 0; i < limit + 1; i++) {
      checkRateLimit("user-a-isolated", limit, 60_000);
    }

    // user-b should still be on its first call
    const resultB = checkRateLimit("user-b-isolated", limit, 60_000);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(limit - 1);

    // user-a should be denied
    const resultA = checkRateLimit("user-a-isolated", limit, 60_000);
    expect(resultA.allowed).toBe(false);
  });

  it("custom limit param is respected", () => {
    vi.setSystemTime(6_000_000);

    // Use a custom limit of 1
    const result1 = checkRateLimit("user-custom-limit", 1, 60_000);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(0);

    const result2 = checkRateLimit("user-custom-limit", 1, 60_000);
    expect(result2.allowed).toBe(false);
    expect(result2.remaining).toBe(0);
  });

  it("uses ASAFE_RATE_LIMIT_RPM env var as default limit", () => {
    vi.stubEnv("ASAFE_RATE_LIMIT_RPM", "2");
    vi.setSystemTime(7_000_000);

    // Two calls should be allowed (limit = 2)
    checkRateLimit("user-env-limit");
    const second = checkRateLimit("user-env-limit");
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    // Third call should be denied
    const third = checkRateLimit("user-env-limit");
    expect(third.allowed).toBe(false);
  });
});
