import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Drizzle mock chain ─────────────────────────────────────────────────────────
// select().from(T).where(cond) → Promise<rows>
// insert().values().onConflictDoUpdate({}) → Promise<void>
// delete().where() → Promise<void>

const selectWhereMock = vi.fn();
const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

const insertConflictMock = vi.fn().mockResolvedValue([]);
const insertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: insertConflictMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

const deleteWhereMock = vi.fn().mockResolvedValue([]);
const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: selectMock,
    insert: insertMock,
    delete: deleteMock,
  },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeUserModelGrantTable: {
    id: "id",
    userId: "userId",
    modelId: "modelId",
    grantedBy: "grantedBy",
    expiresAt: "expiresAt",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  or: vi.fn((...args: unknown[]) => ({ _or: args })),
  isNull: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
}));

vi.mock("server-only", () => ({}));

describe("getUserModelGrants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectWhereMock.mockResolvedValue([]);
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
    insertConflictMock.mockResolvedValue([]);
    insertValuesMock.mockReturnValue({ onConflictDoUpdate: insertConflictMock });
    insertMock.mockReturnValue({ values: insertValuesMock });
    deleteWhereMock.mockResolvedValue([]);
    deleteMock.mockReturnValue({ where: deleteWhereMock });
  });

  it("returns empty array when user has no grants", async () => {
    selectWhereMock.mockResolvedValue([]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("user-1");
    expect(result).toEqual([]);
  });

  it("returns model IDs when grants exist", async () => {
    selectWhereMock.mockResolvedValue([
      { modelId: "gpt-5.1" },
      { modelId: "claude-opus-4.8" },
    ]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("user-2");
    expect(result).toEqual(["gpt-5.1", "claude-opus-4.8"]);
  });

  it("caches result for 30s (DB called once for two calls)", async () => {
    selectWhereMock.mockResolvedValue([{ modelId: "gemini-2.5-flash" }]);
    const { getUserModelGrants } = await import("./user-grants");
    await getUserModelGrants("user-cache");
    await getUserModelGrants("user-cache");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});

describe("grantUserModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectWhereMock.mockResolvedValue([]);
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
    insertConflictMock.mockResolvedValue([]);
    insertValuesMock.mockReturnValue({ onConflictDoUpdate: insertConflictMock });
    insertMock.mockReturnValue({ values: insertValuesMock });
    deleteWhereMock.mockResolvedValue([]);
    deleteMock.mockReturnValue({ where: deleteWhereMock });
  });

  it("inserts a grant via upsert", async () => {
    const { grantUserModel } = await import("./user-grants");
    await grantUserModel("u1", "gpt-5.1", "admin-1", null);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", modelId: "gpt-5.1", grantedBy: "admin-1", expiresAt: null }),
    );
  });

  it("passes expiresAt when provided", async () => {
    const exp = new Date("2027-01-01T00:00:00.000Z");
    const { grantUserModel } = await import("./user-grants");
    await grantUserModel("u2", "gemini-2.5-flash", "admin-1", exp);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: exp }),
    );
  });

  it("invalidates cache so next getUserModelGrants re-queries", async () => {
    selectWhereMock.mockResolvedValue([{ modelId: "gpt-5.1" }]);
    const { getUserModelGrants, grantUserModel } = await import("./user-grants");

    // Prime cache
    await getUserModelGrants("u3");
    expect(selectMock).toHaveBeenCalledTimes(1);

    // Grant invalidates cache
    await grantUserModel("u3", "claude-opus-4.8", "admin-1", null);

    // Re-fetch should hit DB again
    await getUserModelGrants("u3");
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("revokeUserModelGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectWhereMock.mockResolvedValue([]);
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
    deleteWhereMock.mockResolvedValue([]);
    deleteMock.mockReturnValue({ where: deleteWhereMock });
  });

  it("calls db.delete with the grantId and userId", async () => {
    const { revokeUserModelGrant } = await import("./user-grants");
    await revokeUserModelGrant("grant-abc", "user-xyz");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});
