import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Drizzle mock chain ─────────────────────────────────────────────────────────
// select({}).from(T).leftJoin(U,on).where(cond).orderBy(col).limit(n).offset(n)
// count query: select({total}).from(T).where(cond)

let _selectRows: unknown[] = [];
let _countRows: unknown[] = [{ total: 0 }];

const offsetMock = vi.fn().mockImplementation(() => Promise.resolve(_selectRows));
const limitMock = vi.fn().mockReturnValue({ offset: offsetMock });
const orderByMock = vi.fn().mockReturnValue({ limit: limitMock, offset: offsetMock });
const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock });
const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock });
const fromMock = vi.fn().mockReturnValue({
  where: whereMock,
  leftJoin: leftJoinMock,
  orderBy: orderByMock,
  limit: limitMock,
});
const selectMock = vi.fn().mockReturnValue({ from: fromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: selectMock },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeAuditLogTable: {
    id: "id",
    userId: "userId",
    teamId: "teamId",
    eventType: "eventType",
    details: "details",
    createdAt: "createdAt",
  },
  UserTable: { id: "id", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  desc: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

vi.mock("server-only", () => ({}));

describe("getAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    _selectRows = [];
    _countRows = [{ total: 0 }];

    // Re-wire chain
    offsetMock.mockImplementation(() => Promise.resolve(_selectRows));
    limitMock.mockReturnValue({ offset: offsetMock });
    orderByMock.mockReturnValue({ limit: limitMock, offset: offsetMock });
    whereMock.mockReturnValue({ orderBy: orderByMock, limit: limitMock });
    leftJoinMock.mockReturnValue({ where: whereMock, orderBy: orderByMock });
    fromMock.mockReturnValue({
      where: whereMock,
      leftJoin: leftJoinMock,
      orderBy: orderByMock,
      limit: limitMock,
    });

    // selectMock needs to return different results for the data query vs the count query
    let callCount = 0;
    selectMock.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 0) {
        // Count query — shorter chain
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(_countRows),
          }),
        };
      }
      // Data query — full chain
      return { from: fromMock };
    });
  });

  it("returns rows and total from DB", async () => {
    _selectRows = [
      { id: "a1", userId: "u1", userEmail: "alice@example.com", teamId: null, eventType: "chat_request", details: {}, createdAt: new Date() },
    ];
    _countRows = [{ total: 1 }];

    const { getAuditLog } = await import("./audit");
    const { rows, total } = await getAuditLog({ page: 1, limit: 50 });

    expect(rows).toHaveLength(1);
    expect(total).toBe(1);
  });

  it("returns empty rows and zero total when no events", async () => {
    _selectRows = [];
    _countRows = [{ total: 0 }];

    const { getAuditLog } = await import("./audit");
    const { rows, total } = await getAuditLog();

    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("applies page and limit correctly via offset", async () => {
    _selectRows = [];
    _countRows = [{ total: 0 }];

    const { getAuditLog } = await import("./audit");
    await getAuditLog({ page: 3, limit: 10 });

    expect(offsetMock).toHaveBeenCalledWith(20); // (3-1)*10
    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it("calls DB twice (data query + count query)", async () => {
    _selectRows = [];
    _countRows = [{ total: 0 }];

    const { getAuditLog } = await import("./audit");
    await getAuditLog({ page: 1, limit: 50 });

    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});

describe("AUDIT_EVENT_TYPES", () => {
  it("exports all expected event types", async () => {
    const { AUDIT_EVENT_TYPES } = await import("./audit");
    expect(AUDIT_EVENT_TYPES).toContain("chat_request");
    expect(AUDIT_EVENT_TYPES).toContain("guardrail_firing");
    expect(AUDIT_EVENT_TYPES).toContain("admin_action");
    expect(AUDIT_EVENT_TYPES).toContain("user_erasure");
    expect(AUDIT_EVENT_TYPES).toContain("aup_accepted");
  });
});
