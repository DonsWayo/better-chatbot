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
      { modelId: "gpt-5.5" },
      { modelId: "claude-opus-4.8" },
    ]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("user-2");
    expect(result).toEqual(["gpt-5.5", "claude-opus-4.8"]);
  });

  it("caches result for 30s (DB called once for two calls)", async () => {
    selectWhereMock.mockResolvedValue([{ modelId: "gemini-3.5-flash" }]);
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
    await grantUserModel("u1", "gpt-5.5", "admin-1", null);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", modelId: "gpt-5.5", grantedBy: "admin-1", expiresAt: null }),
    );
  });

  it("passes expiresAt when provided", async () => {
    const exp = new Date("2027-01-01T00:00:00.000Z");
    const { grantUserModel } = await import("./user-grants");
    await grantUserModel("u2", "gemini-3.5-flash", "admin-1", exp);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: exp }),
    );
  });

  it("invalidates cache so next getUserModelGrants re-queries", async () => {
    selectWhereMock.mockResolvedValue([{ modelId: "gpt-5.5" }]);
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

  it("resolves without throwing", async () => {
    const { revokeUserModelGrant } = await import("./user-grants");
    await expect(revokeUserModelGrant("grant-ok", "user-ok")).resolves.toBeUndefined();
  });
});

describe("getUserModelGrants — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectWhereMock.mockResolvedValue([]);
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
  });

  it("returns only string model IDs (not row objects)", async () => {
    selectWhereMock.mockResolvedValue([{ modelId: "gpt-5.5" }, { modelId: "claude-opus-4.8" }]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("u-str");
    expect(result.every((m) => typeof m === "string")).toBe(true);
  });

  it("returns empty array when no grants found", async () => {
    selectWhereMock.mockResolvedValue([]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("u-none");
    expect(result).toHaveLength(0);
  });
});

describe("grantUserModel — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    insertConflictMock.mockResolvedValue([]);
    insertValuesMock.mockReturnValue({ onConflictDoUpdate: insertConflictMock });
    insertMock.mockReturnValue({ values: insertValuesMock });
  });

  it("resolves without throwing", async () => {
    const { grantUserModel } = await import("./user-grants");
    await expect(grantUserModel("u1", "gpt-5.5", "admin-1", null)).resolves.not.toThrow();
  });

  it("calls insertMock exactly once per grant", async () => {
    const { grantUserModel } = await import("./user-grants");
    await grantUserModel("u2", "gemini-3.5-flash", "admin-1", null);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});

describe("revokeUserModelGrant — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    deleteWhereMock.mockResolvedValue([]);
    deleteMock.mockReturnValue({ where: deleteWhereMock });
  });

  it("deleteWhereMock called exactly once per revoke", async () => {
    const { revokeUserModelGrant } = await import("./user-grants");
    await revokeUserModelGrant("grant-1", "user-1");
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("resolves to undefined", async () => {
    const { revokeUserModelGrant } = await import("./user-grants");
    const result = await revokeUserModelGrant("grant-1", "user-1");
    expect(result).toBeUndefined();
  });

  it("deleteMock called exactly once per revoke", async () => {
    const { revokeUserModelGrant } = await import("./user-grants");
    await revokeUserModelGrant("grant-2", "user-2");
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});

describe("getUserModelGrants — response invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    selectWhereMock.mockResolvedValue([]);
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectMock.mockReturnValue({ from: selectFromMock });
  });

  it("result is always an array", async () => {
    selectWhereMock.mockResolvedValue([]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("u-arr");
    expect(Array.isArray(result)).toBe(true);
  });

  it("selectMock called exactly once per uncached request", async () => {
    selectWhereMock.mockResolvedValue([]);
    const { getUserModelGrants } = await import("./user-grants");
    await getUserModelGrants("u-fresh");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns array of strings not array of objects", async () => {
    selectWhereMock.mockResolvedValue([{ modelId: "openai/gpt-5.5" }]);
    const { getUserModelGrants } = await import("./user-grants");
    const result = await getUserModelGrants("u-typed");
    expect(typeof result[0]).toBe("string");
  });

  it("multiple userId queries for different users are independent", async () => {
    selectWhereMock
      .mockResolvedValueOnce([{ modelId: "model-a" }])
      .mockResolvedValueOnce([{ modelId: "model-b" }]);
    const { getUserModelGrants } = await import("./user-grants");
    const r1 = await getUserModelGrants("u-x1");
    const r2 = await getUserModelGrants("u-x2");
    expect(r1).toEqual(["model-a"]);
    expect(r2).toEqual(["model-b"]);
  });
});
