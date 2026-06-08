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
});
