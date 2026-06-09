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
});
