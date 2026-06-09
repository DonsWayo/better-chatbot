import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// DB mock setup
const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectWhereLimitMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({
  where: (cond: unknown) => {
    const chain = {
      then: (resolve: (v: unknown[]) => void) => Promise.resolve([]).then(resolve),
      limit: dbSelectWhereLimitMock,
    };
    // Make where() both awaitable and chainable
    Object.assign(chain, { [Symbol.for("vitest.promise")]: Promise.resolve([]) });
    return Object.assign(Promise.resolve([]), { limit: dbSelectWhereLimitMock });
  },
});
const dbSelectMock = vi.fn().mockReturnValue({ from: dbSelectFromMock });

const dbUpdateWhereMock = vi.fn().mockResolvedValue([]);
const dbUpdateSetMock = vi.fn().mockReturnValue({ where: dbUpdateWhereMock });
const dbUpdateMock = vi.fn().mockReturnValue({ set: dbUpdateSetMock });

const dbDeleteWhereMock = vi.fn().mockResolvedValue([]);
const dbDeleteMock = vi.fn().mockReturnValue({ where: dbDeleteWhereMock });

const dbExecuteMock = vi.fn().mockResolvedValue([]);

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: dbSelectMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
    execute: dbExecuteMock,
  },
}));
vi.mock("@/lib/db/pg/schema.pg", () => ({
  UserTable: { id: "id", email: "email", name: "name", image: "image", acceptedAupAt: "acceptedAupAt" },
  ChatThreadTable: { userId: "userId" },
  AsafeUsageEventTable: { userId: "userId" },
  AsafeAuditLogTable: { userId: "userId" },
  AsafeAupAcceptanceTable: { userId: "userId" },
  AsafeTeamMemberTable: { userId: "userId" },
  AsafeUserModelGrantTable: { userId: "userId" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ query: strings.join("?"), values })),
}));

describe("eraseUserData", () => {
  beforeEach(() => { vi.clearAllMocks(); dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock }); dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock }); });

  it("returns tablesCleared with all 7 entries", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    const result = await eraseUserData("user-123");
    expect(result.tablesCleared).toHaveLength(7);
    expect(result.tablesCleared).toContain("user");
    expect(result.tablesCleared).toContain("chat_thread");
    expect(result.tablesCleared).toContain("asafe_audit_log (erasure record)");
  });

  it("calls db.update to anonymise user profile", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    await eraseUserData("user-abc");
    expect(dbUpdateMock).toHaveBeenCalled();
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "[erased]" }),
    );
  });

  it("inserts erasure audit record via db.execute", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    await eraseUserData("user-xyz");
    expect(dbExecuteMock).toHaveBeenCalledOnce();
  });

  it("sets email to erased tombstone containing userId", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    await eraseUserData("user-789");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.stringContaining("user-789") }),
    );
  });

  it("sets image to null in update", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    await eraseUserData("u1");
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ image: null }),
    );
  });

  it("tablesCleared includes all cascade-deleted tables", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    const result = await eraseUserData("u1");
    const cascadeTables = ["asafe_usage_event", "asafe_user_model_grant", "asafe_aup_acceptance", "asafe_team_member"];
    for (const table of cascadeTables) {
      expect(result.tablesCleared, `missing: ${table}`).toContain(table);
    }
  });

  it("calls db.delete 5 times (5 cascade tables)", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    await eraseUserData("u1");
    expect(dbDeleteMock).toHaveBeenCalledTimes(5);
  });
});

describe("exportUserData", () => {
  beforeEach(() => { vi.clearAllMocks(); dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock }); dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock }); });

  it("returns object with correct shape", async () => {
    const { exportUserData } = await import("./gdpr");
    const result = await exportUserData("user-export-1");
    expect(result).toHaveProperty("exportedAt");
    expect(result).toHaveProperty("userId");
    expect(result).toHaveProperty("profile");
    expect(result).toHaveProperty("chatThreads");
    expect(result).toHaveProperty("usageEvents");
    expect(result).toHaveProperty("auditEntries");
  });

  it("returns userId matching the input", async () => {
    const { exportUserData } = await import("./gdpr");
    const result = await exportUserData("user-export-2");
    expect(result.userId).toBe("user-export-2");
  });

  it("returns profile as null when user not found (empty select)", async () => {
    const { exportUserData } = await import("./gdpr");
    const result = await exportUserData("nonexistent");
    expect(result.profile).toBeNull();
  });

  it("returns arrays for all collection fields", async () => {
    const { exportUserData } = await import("./gdpr");
    const result = await exportUserData("u1");
    expect(Array.isArray(result.chatThreads)).toBe(true);
    expect(Array.isArray(result.usageEvents)).toBe(true);
    expect(Array.isArray(result.auditEntries)).toBe(true);
    expect(Array.isArray(result.teamMemberships)).toBe(true);
    expect(Array.isArray(result.modelGrants)).toBe(true);
  });
});

describe("eraseUserData — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); dbUpdateMock.mockReturnValue({ set: dbUpdateSetMock }); dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock }); });

  it("result has userId field matching input", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    const result = await eraseUserData("user-id-check");
    expect(result).toHaveProperty("userId");
    expect((result as any).userId).toBe("user-id-check");
  });

  it("result is an object (not null)", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    const result = await eraseUserData("u-obj");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");
  });

  it("tablesCleared is a non-empty array", async () => {
    dbExecuteMock.mockResolvedValueOnce([]);
    const { eraseUserData } = await import("./gdpr");
    const result = await eraseUserData("u-tc");
    expect(Array.isArray(result.tablesCleared)).toBe(true);
    expect(result.tablesCleared.length).toBeGreaterThan(0);
  });
});

describe("exportUserData — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("exportedAt is an ISO date string", async () => {
    const { exportUserData } = await import("./gdpr");
    const result = await exportUserData("u-date");
    expect(typeof result.exportedAt).toBe("string");
    expect(new Date(result.exportedAt).toISOString()).toBeTruthy();
  });

  it("userId in result matches input argument", async () => {
    const { exportUserData } = await import("./gdpr");
    const result = await exportUserData("exact-user-id");
    expect(result.userId).toBe("exact-user-id");
  });
});
