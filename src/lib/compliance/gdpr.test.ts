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
});
