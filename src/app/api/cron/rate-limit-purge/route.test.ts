import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDelete } = vi.hoisted(() => ({ mockDelete: vi.fn() }));

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { delete: mockDelete } }));
vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeRateLimitBucketTable: { userId: "user_id", windowStart: "window_start" },
  AsafeKvCacheTable: { key: "key", expiresAt: "expires_at" },
}));
vi.mock("drizzle-orm", () => ({
  lt: vi.fn((col, val) => ({ __op: "lt", col, val })),
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
}));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

function makeRequest(secret?: string): NextRequest {
  const headers = new Headers();
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return { headers } as unknown as NextRequest;
}

/**
 * Queue the two delete chains the route performs (rate-limit buckets, then
 * kv-cache rows). Each call is `db.delete(table).where(...).returning(...)`.
 * Records the predicate passed to `.where` so tests can assert the delete
 * shape (lt cutoff comparison) without a real DB.
 */
function primeDeletes(
  rateLimitRows: unknown[],
  kvCacheRows: unknown[],
): { whereArgs: unknown[] } {
  const whereArgs: unknown[] = [];
  const rowsByCall = [rateLimitRows, kvCacheRows];
  const chain = (rows: unknown[]) => ({
    where: vi.fn((predicate: unknown) => {
      whereArgs.push(predicate);
      return { returning: vi.fn().mockResolvedValue(rows) };
    }),
  });
  // mockReset (not the suite's clearAllMocks) so no leftover once-queue from a
  // prior test bleeds in; drive the two deletes by call index instead.
  mockDelete.mockReset();
  mockDelete.mockImplementation(() => {
    const callIndex = mockDelete.mock.calls.length - 1;
    return chain(rowsByCall[callIndex] ?? []);
  });
  return { whereArgs };
}

describe("POST /api/cron/rate-limit-purge — auth", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" };
    primeDeletes([], []);
  });

  it("returns 401 without auth", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET not set", async () => {
    process.env.CRON_SECRET = "";
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET env is undefined", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(401);
  });

  it("secret comparison is case-sensitive", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("TEST-SECRET"));
    expect(res.status).toBe(401);
  });

  it("never calls db.delete when unauthorized", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("never calls db.delete with wrong secret", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest("nope"));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("POST /api/cron/rate-limit-purge — delete behavior", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" };
  });

  it("deletes from BOTH tables (two db.delete calls) on success", async () => {
    primeDeletes([], []);
    const { POST } = await import("./route");
    await POST(makeRequest("test-secret"));
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("returns per-table deleted counts", async () => {
    primeDeletes([{ userId: "u1" }, { userId: "u2" }], [{ key: "k1" }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rateLimitDeleted).toBe(2);
    expect(body.kvCacheDeleted).toBe(1);
  });

  it("returns zero counts when nothing to purge", async () => {
    primeDeletes([], []);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(body.rateLimitDeleted).toBe(0);
    expect(body.kvCacheDeleted).toBe(0);
  });

  it("response includes an ISO cutoff string in the past", async () => {
    primeDeletes([], []);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(typeof body.cutoff).toBe("string");
    expect(new Date(body.cutoff).getTime()).toBeLessThan(Date.now());
  });

  it("rate-limit cutoff is ~1h before now", async () => {
    primeDeletes([], []);
    const { POST } = await import("./route");
    const before = Date.now();
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    const cutoffMs = new Date(body.cutoff).getTime();
    // within a small tolerance of exactly one hour ago
    expect(before - cutoffMs).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5_000);
    expect(before - cutoffMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
  });

  it("delete query shape: both deletes filter with an lt() predicate", async () => {
    const { lt } = await import("drizzle-orm");
    const { whereArgs } = primeDeletes([], []);
    const { POST } = await import("./route");
    await POST(makeRequest("test-secret"));
    // Two where() calls, both fed an lt() predicate object.
    expect(whereArgs).toHaveLength(2);
    for (const arg of whereArgs) {
      expect(arg).toMatchObject({ __op: "lt" });
    }
    expect(lt).toHaveBeenCalledTimes(2);
  });

  it("response is a JSON Response with the expected fields", async () => {
    primeDeletes([], []);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toHaveProperty("rateLimitDeleted");
    expect(body).toHaveProperty("kvCacheDeleted");
    expect(body).toHaveProperty("cutoff");
  });
});
