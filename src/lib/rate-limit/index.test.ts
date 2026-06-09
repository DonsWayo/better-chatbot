import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module before importing the function under test
vi.mock("@/lib/db/pg/db.pg", () => {
  const insertMock = vi.fn();
  return {
    pgDb: {
      insert: insertMock,
    },
  };
});

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeRateLimitBucketTable: {
    userId: "user_id",
    windowStart: "window_start",
    count: "count",
  },
}));

import { pgDb } from "@/lib/db/pg/db.pg";
import { checkRateLimit } from "./index";

function makeInsertChain(returnedCount: number | null) {
  const returningFn = vi.fn().mockResolvedValue(
    returnedCount !== null ? [{ count: returnedCount }] : [],
  );
  const onConflictFn = vi.fn().mockReturnValue({ returning: returningFn });
  const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictFn });
  return { valuesFn, onConflictFn, returningFn };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit (Postgres-backed)", () => {
  it("when DB returns count=1, allowed=true, remaining=limit-1", async () => {
    const { valuesFn } = makeInsertChain(1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-1", 10, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(typeof result.resetAt).toBe("number");
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1);
  });

  it("when DB returns count=limit+1, allowed=false, remaining=0", async () => {
    const limit = 5;
    const { valuesFn } = makeInsertChain(limit + 1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-2", limit, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("when DB throws, allowed=true (fail open)", async () => {
    const valuesFn = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("DB connection lost")),
      }),
    });
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkRateLimit("user-3", 10, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("rate-limit DB error"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("count equals limit → remaining=0, allowed=true", async () => {
    const limit = 5;
    const { valuesFn } = makeInsertChain(limit); // count = limit exactly
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-4", limit, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("resetAt is in the future", async () => {
    const before = Date.now();
    const { valuesFn } = makeInsertChain(1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-5", 10, 60_000);
    expect(result.resetAt).toBeGreaterThan(before);
  });

  it("calls insert exactly once per call", async () => {
    const { valuesFn } = makeInsertChain(1);
    const insertSpy = (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    await checkRateLimit("user-6", 10, 60_000);
    expect(insertSpy).toHaveBeenCalledOnce();
  });

  it("returns the provided limit in result", async () => {
    const { valuesFn } = makeInsertChain(1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-7", 25, 60_000);
    expect(result.limit).toBe(25);
  });

  it("result has all four required fields", async () => {
    const { valuesFn } = makeInsertChain(1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-fields", 10, 60_000);
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("limit");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("resetAt");
  });

  it("remaining is clamped to 0 when count greatly exceeds limit", async () => {
    const { valuesFn } = makeInsertChain(1000);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-over", 5, 60_000);
    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
  });

  it("fail-open remaining equals the provided limit", async () => {
    const valuesFn = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error("fail")),
      }),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-fail", 15, 60_000);
    expect(result.remaining).toBe(15);
    expect(result.allowed).toBe(true);
    consoleSpy.mockRestore();
  });

  it("resetAt is within one windowMs of current time", async () => {
    const before = Date.now();
    const windowMs = 30_000;
    const { valuesFn } = makeInsertChain(1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-reset", 10, windowMs);
    // resetAt is the window boundary: floor(now/window)*window + window
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + windowMs + 100);
  });

  it("allowed is strictly boolean type", async () => {
    const { valuesFn } = makeInsertChain(1);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-bool", 10, 60_000);
    expect(typeof result.allowed).toBe("boolean");
  });

  it("allowed is true when count is much less than limit", async () => {
    const { valuesFn } = makeInsertChain(2);
    (pgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesFn });

    const result = await checkRateLimit("user-low", 100, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(98);
  });
});
