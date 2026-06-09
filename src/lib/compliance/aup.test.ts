import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { selectLimitMock, insertOnConflictMock } = vi.hoisted(() => ({
  selectLimitMock: vi.fn().mockResolvedValue([]),
  insertOnConflictMock: vi.fn().mockResolvedValue([]),
}));

const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

const insertValuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflictMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: selectMock, insert: insertMock },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeAupAcceptanceTable: { id: "id", userId: "user_id", aupVersion: "aup_version" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
}));

vi.mock("server-only", () => ({}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("hasAcceptedAup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectLimitMock.mockResolvedValue([]);
    selectWhereMock.mockReturnValue({ limit: selectLimitMock });
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
  });

  it("returns false when no acceptance record exists", async () => {
    selectLimitMock.mockResolvedValue([]);
    const { hasAcceptedAup } = await import("./aup");
    expect(await hasAcceptedAup("user-1")).toBe(false);
  });

  it("returns true when acceptance record exists", async () => {
    selectLimitMock.mockResolvedValue([{ id: "abc" }]);
    const { hasAcceptedAup } = await import("./aup");
    expect(await hasAcceptedAup("user-2")).toBe(true);
  });

  it("fails open (returns true) on DB error so AUP check never blocks chat", async () => {
    selectLimitMock.mockRejectedValue(new Error("DB down"));
    const { hasAcceptedAup } = await import("./aup");
    expect(await hasAcceptedAup("user-err")).toBe(true);
  });

  it("caches the result so DB is called only once within TTL", async () => {
    selectLimitMock.mockResolvedValue([{ id: "abc" }]);
    const { hasAcceptedAup } = await import("./aup");
    await hasAcceptedAup("user-cached");
    await hasAcceptedAup("user-cached");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});

describe("recordAupAcceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    insertValuesMock.mockReturnValue({ onConflictDoNothing: insertOnConflictMock });
    insertMock.mockReturnValue({ values: insertValuesMock });
    selectLimitMock.mockResolvedValue([]);
    selectWhereMock.mockReturnValue({ limit: selectLimitMock });
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
  });

  it("inserts an AUP acceptance record", async () => {
    const { recordAupAcceptance } = await import("./aup");
    await recordAupAcceptance("user-3");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertOnConflictMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache so next hasAcceptedAup re-queries", async () => {
    selectLimitMock.mockResolvedValue([{ id: "xyz" }]);
    const { hasAcceptedAup, recordAupAcceptance } = await import("./aup");

    await hasAcceptedAup("user-inv"); // primes cache
    expect(selectMock).toHaveBeenCalledTimes(1);

    await recordAupAcceptance("user-inv"); // should invalidate cache

    await hasAcceptedAup("user-inv"); // should re-query
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("resolves without throwing", async () => {
    const { recordAupAcceptance } = await import("./aup");
    await expect(recordAupAcceptance("user-ok")).resolves.toBeUndefined();
  });
});

describe("hasAcceptedAup — additional cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectLimitMock.mockResolvedValue([]);
    selectWhereMock.mockReturnValue({ limit: selectLimitMock });
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
  });

  it("different userIds are handled independently (no cross-user contamination)", async () => {
    selectLimitMock
      .mockResolvedValueOnce([{ id: "r1" }])  // user-A: has accepted
      .mockResolvedValueOnce([]);               // user-B: has not accepted
    const { hasAcceptedAup } = await import("./aup");
    const resultA = await hasAcceptedAup("user-A");
    const resultB = await hasAcceptedAup("user-B");
    expect(resultA).toBe(true);
    expect(resultB).toBe(false);
  });

  it("returns boolean (not truthy/falsy arbitrary value)", async () => {
    selectLimitMock.mockResolvedValue([{ id: "abc" }]);
    const { hasAcceptedAup } = await import("./aup");
    const result = await hasAcceptedAup("user-bool");
    expect(typeof result).toBe("boolean");
  });
});

describe("recordAupAcceptance — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    insertValuesMock.mockReturnValue({ onConflictDoNothing: insertOnConflictMock });
    insertMock.mockReturnValue({ values: insertValuesMock });
  });

  it("calls insert exactly once per recordAupAcceptance", async () => {
    const { recordAupAcceptance } = await import("./aup");
    await recordAupAcceptance("user-once");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("onConflictDoNothing is always used (idempotent re-acceptance)", async () => {
    const { recordAupAcceptance } = await import("./aup");
    await recordAupAcceptance("user-idem");
    expect(insertOnConflictMock).toHaveBeenCalledTimes(1);
  });

  it("resolves with undefined (no return value)", async () => {
    const { recordAupAcceptance } = await import("./aup");
    const result = await recordAupAcceptance("user-ret");
    expect(result).toBeUndefined();
  });
});

describe("hasAcceptedAup — response type invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectLimitMock.mockResolvedValue([]);
    selectWhereMock.mockReturnValue({ limit: selectLimitMock });
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
  });

  it("returns boolean true when acceptance record exists", async () => {
    selectLimitMock.mockResolvedValue([{ id: "x" }]);
    const { hasAcceptedAup } = await import("./aup");
    const result = await hasAcceptedAup("u-true");
    expect(result).toBe(true);
    expect(typeof result).toBe("boolean");
  });

  it("returns boolean false when no acceptance record", async () => {
    selectLimitMock.mockResolvedValue([]);
    const { hasAcceptedAup } = await import("./aup");
    const result = await hasAcceptedAup("u-false");
    expect(result).toBe(false);
    expect(typeof result).toBe("boolean");
  });

  it("selectMock called exactly once per un-cached check", async () => {
    selectLimitMock.mockResolvedValue([]);
    const { hasAcceptedAup } = await import("./aup");
    await hasAcceptedAup("fresh-user-rtype");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns a boolean even when DB throws (fail-open)", async () => {
    selectLimitMock.mockRejectedValue(new Error("db err"));
    const { hasAcceptedAup } = await import("./aup");
    const result = await hasAcceptedAup("err-user");
    expect(typeof result).toBe("boolean");
  });
});

describe("hasAcceptedAup and recordAupAcceptance — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); selectLimitMock.mockResolvedValue([]); });

  it("selectMock called exactly once per hasAcceptedAup", async () => {
    const { hasAcceptedAup } = await import("./aup");
    await hasAcceptedAup("u-1");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("insertMock called exactly once per recordAupAcceptance", async () => {
    const { recordAupAcceptance } = await import("./aup");
    await recordAupAcceptance("u-1");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("hasAcceptedAup returns true when DB has a row", async () => {
    selectLimitMock.mockResolvedValueOnce([{ userId: "u-1" }]);
    const { hasAcceptedAup } = await import("./aup");
    const result = await hasAcceptedAup("u-1");
    expect(result).toBe(true);
  });

  it("hasAcceptedAup returns false when DB has no row", async () => {
    selectLimitMock.mockResolvedValueOnce([]);
    const { hasAcceptedAup } = await import("./aup");
    const result = await hasAcceptedAup("u-no-row");
    expect(result).toBe(false);
  });
});
