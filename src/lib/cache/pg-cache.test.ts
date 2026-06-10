import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock factories are hoisted to the top of the file, so shared variables
// must themselves be created with vi.hoisted() to be available inside them.
// ---------------------------------------------------------------------------

const {
  limitMock,
  whereMock,
  fromMock,
  selectChain,
  onConflictDoUpdateMock,
  valuesMock,
  insertChain,
  deleteWhereMock,
  deleteChain,
  mockDbRef,
} = vi.hoisted(() => {
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectChain = { from: fromMock };

  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
  const insertChain = { values: valuesMock };

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteChain = { where: deleteWhereMock };

  const mockDbRef = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
  };

  return {
    limitMock,
    whereMock,
    fromMock,
    selectChain,
    onConflictDoUpdateMock,
    valuesMock,
    insertChain,
    deleteWhereMock,
    deleteChain,
    mockDbRef,
  };
});

vi.mock("@/lib/db/pg/db.pg", () => ({ pgDb: mockDbRef }));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeKvCacheTable: { key: "key", value: "value", expiresAt: "expiresAt" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  isNull: vi.fn((_a: unknown) => ({})),
  or: vi.fn((..._args: unknown[]) => ({})),
  gt: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  like: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

vi.mock("server-only", () => ({}));

import { PgCache } from "./pg-cache";

describe("PgCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire chains after clearAllMocks resets return values
    limitMock.mockResolvedValue([]);
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    mockDbRef.select.mockReturnValue(selectChain);

    valuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
    onConflictDoUpdateMock.mockResolvedValue(undefined);
    mockDbRef.insert.mockReturnValue(insertChain);

    deleteWhereMock.mockResolvedValue(undefined);
    mockDbRef.delete.mockReturnValue(deleteChain);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- get() ---

  it("get() returns value when DB returns a non-expired row", async () => {
    const row = {
      key: "foo",
      value: { hello: "world" },
      expiresAt: new Date(Date.now() + 60_000),
    };
    limitMock.mockResolvedValueOnce([row]);

    const cache = new PgCache();
    const result = await cache.get("foo");
    expect(result).toEqual({ hello: "world" });
  });

  it("get() returns undefined when DB returns an empty array", async () => {
    limitMock.mockResolvedValueOnce([]);

    const cache = new PgCache();
    const result = await cache.get("missing-key");
    expect(result).toBeUndefined();
  });

  it("get() returns undefined when the row's expiresAt is in the past (DB filters it out)", async () => {
    // The WHERE clause in PgCache.get() filters out expired rows via gt(expiresAt, new Date()).
    // The DB enforces the filter — so the mock returns [] to simulate an expired entry.
    limitMock.mockResolvedValueOnce([]);

    const cache = new PgCache();
    const result = await cache.get("old-key");
    expect(result).toBeUndefined();
  });

  // --- set() ---

  it("set() with finite ttlMs stores a row where expiresAt = now + ttlMs", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(now);

    const cache = new PgCache();
    await cache.set("my-key", "my-value", 5_000);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "my-key",
        value: "my-value",
        expiresAt: new Date(now + 5_000),
      }),
    );
  });

  it("set() with no TTL stores a row with expiresAt = null", async () => {
    const cache = new PgCache();
    await cache.set("persistent-key", 42);

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "persistent-key",
        value: 42,
        expiresAt: null,
      }),
    );
  });

  // --- delete() ---

  it("delete() calls db.delete with the correct key", async () => {
    const cache = new PgCache();
    await cache.delete("del-key");

    expect(mockDbRef.delete).toHaveBeenCalled();
    expect(deleteWhereMock).toHaveBeenCalled();
  });

  // --- has() ---

  it("has() returns true when a row exists and false when not", async () => {
    const cache = new PgCache();

    // Row found
    limitMock.mockResolvedValueOnce([
      { key: "present", value: "v", expiresAt: null },
    ]);
    expect(await cache.has("present")).toBe(true);

    // No row
    limitMock.mockResolvedValueOnce([]);
    expect(await cache.has("absent")).toBe(false);
  });

  // --- prefix ---

  it("with prefix 'ns:', set('foo', ...) stores with key 'ns:foo'", async () => {
    const cache = new PgCache("ns:");
    await cache.set("foo", "bar");

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "ns:foo" }),
    );
  });
});

describe("PgCache — additional operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    limitMock.mockResolvedValue([]);
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    mockDbRef.select.mockReturnValue(selectChain);

    valuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
    onConflictDoUpdateMock.mockResolvedValue(undefined);
    mockDbRef.insert.mockReturnValue(insertChain);

    deleteWhereMock.mockResolvedValue(undefined);
    mockDbRef.delete.mockReturnValue(deleteChain);
  });

  it("set() calls insert exactly once", async () => {
    const cache = new PgCache();
    await cache.set("key1", "val1");
    expect(mockDbRef.insert).toHaveBeenCalledTimes(1);
  });

  it("delete() calls db.delete exactly once", async () => {
    const cache = new PgCache();
    await cache.delete("key-del");
    expect(mockDbRef.delete).toHaveBeenCalledTimes(1);
  });

  it("get() calls db.select exactly once", async () => {
    const cache = new PgCache();
    await cache.get("key-get");
    expect(mockDbRef.select).toHaveBeenCalledTimes(1);
  });

  it("has() calls db.select exactly once", async () => {
    const cache = new PgCache();
    await cache.has("key-has");
    expect(mockDbRef.select).toHaveBeenCalledTimes(1);
  });

  it("set() with zero ttlMs stores an immediate Date expiry (only undefined/null ttl means no expiry)", async () => {
    const cache = new PgCache();
    await cache.set("k", "v", 0);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: expect.any(Date) }),
    );
  });

  it("set() with no ttlMs stores null expiresAt", async () => {
    const cache = new PgCache();
    await cache.set("k", "v");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null }),
    );
  });

  it("no-prefix cache stores key without prefix separator", async () => {
    const cache = new PgCache();
    await cache.set("plain-key", "v");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "plain-key" }),
    );
  });
});

describe("PgCache — status and invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRef.select.mockReturnValue(selectChain);
    mockDbRef.insert.mockReturnValue(insertChain);
    mockDbRef.delete.mockReturnValue(deleteChain);
    limitMock.mockResolvedValue([]);
    onConflictDoUpdateMock.mockResolvedValue(undefined);
    deleteWhereMock.mockResolvedValue(undefined);
  });

  it("get() returns undefined when no record found", async () => {
    limitMock.mockResolvedValue([]);
    const cache = new PgCache();
    const result = await cache.get("missing-key");
    expect(result).toBeUndefined();
  });

  it("set() calls db.insert exactly once", async () => {
    const cache = new PgCache();
    await cache.set("k", "v");
    expect(mockDbRef.insert).toHaveBeenCalledTimes(1);
  });

  it("delete() calls db.delete exactly once", async () => {
    const cache = new PgCache();
    await cache.delete("k");
    expect(mockDbRef.delete).toHaveBeenCalledTimes(1);
  });

  it("has() returns false when select returns empty array", async () => {
    limitMock.mockResolvedValue([]);
    const cache = new PgCache();
    const result = await cache.has("not-there");
    expect(result).toBe(false);
  });
});

describe("PgCache — additional invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([]);
  });

  it("get() returns undefined for missing key", async () => {
    const cache = new PgCache();
    expect(await cache.get("no-such-key")).toBeUndefined();
  });

  it("set() followed by get() returns set value (mock chain)", async () => {
    const cache = new PgCache();
    // value is a jsonb column: stored/returned as-is, no JSON.stringify round-trip
    const row = { value: "hello", expiresAt: null };
    limitMock.mockResolvedValueOnce([row]);
    await cache.set("greet", "hello");
    const val = await cache.get("greet");
    expect(val).toBe("hello");
  });

  it("clear() calls db.delete exactly once", async () => {
    const cache = new PgCache();
    await cache.clear();
    expect(mockDbRef.delete).toHaveBeenCalledTimes(1);
  });

  it("has() returns true when select returns one row", async () => {
    const row = { value: JSON.stringify("v"), expiresAt: null };
    limitMock.mockResolvedValueOnce([row]);
    const cache = new PgCache();
    expect(await cache.has("present-key")).toBe(true);
  });
});
