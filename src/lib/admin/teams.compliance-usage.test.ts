import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Chainable SELECT mock for the three parallel aggregation queries in
// getComplianceUsageSummary:
//   byModel: select().from().where().groupBy().orderBy()      → rows
//   byTeam:  select().from().leftJoin().where().groupBy().orderBy() → rows
//   total:   select().from().where()                          → thenable rows
// ---------------------------------------------------------------------------

let _byModelRows: unknown[] = [];
let _byTeamRows: unknown[] = [];
let _totalRows: unknown[] = [];

let orderByCall = 0;
const orderByMock = vi.fn().mockImplementation(() => {
  orderByCall++;
  return Promise.resolve(orderByCall === 1 ? _byModelRows : _byTeamRows);
});
const groupByMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
const whereMock = vi.fn().mockImplementation(() => ({
  groupBy: groupByMock,
  // Thenable so the un-grouped totals query can be awaited directly.
  then: (resolve: (rows: unknown[]) => void) => resolve(_totalRows),
}));
const leftJoinMock = vi.fn().mockReturnValue({ where: whereMock });
const fromMock = vi
  .fn()
  .mockReturnValue({ where: whereMock, leftJoin: leftJoinMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: selectMock },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeTeamTable: { id: "id", name: "name" },
  AsafeTeamMemberTable: { id: "id" },
  AsafeTeamBudgetTable: { teamId: "teamId" },
  AsafeUsageEventTable: {
    userId: "userId",
    teamId: "teamId",
    model: "model",
    provider: "provider",
    taskClass: "taskClass",
    promptTokens: "promptTokens",
    completionTokens: "completionTokens",
    costUsd: "costUsd",
    createdAt: "createdAt",
  },
  UserTable: { id: "id", email: "email" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
  gte: vi.fn((_a: unknown, _b: unknown) => ({})),
  lte: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  desc: vi.fn((_a: unknown) => ({})),
}));

vi.mock("server-only", () => ({}));

describe("getComplianceUsageSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    _byModelRows = [];
    _byTeamRows = [];
    _totalRows = [];
    orderByCall = 0;

    orderByMock.mockImplementation(() => {
      orderByCall++;
      return Promise.resolve(orderByCall === 1 ? _byModelRows : _byTeamRows);
    });
    groupByMock.mockReturnValue({ orderBy: orderByMock });
    whereMock.mockImplementation(() => ({
      groupBy: groupByMock,
      then: (resolve: (rows: unknown[]) => void) => resolve(_totalRows),
    }));
    leftJoinMock.mockReturnValue({ where: whereMock });
    fromMock.mockReturnValue({ where: whereMock, leftJoin: leftJoinMock });
    selectMock.mockReturnValue({ from: fromMock });
  });

  it("returns byModel rows from the grouped model query", async () => {
    _byModelRows = [
      {
        model: "gpt-5.2",
        requests: 3,
        inputTokens: 300,
        outputTokens: 150,
        costUsd: "0.30",
      },
    ];
    _totalRows = [
      { requests: 3, inputTokens: 300, outputTokens: 150, costUsd: "0.30" },
    ];

    const { getComplianceUsageSummary } = await import("./teams");
    const summary = await getComplianceUsageSummary({});
    expect(summary.byModel).toHaveLength(1);
    expect(summary.byModel[0].model).toBe("gpt-5.2");
    expect(summary.byModel[0].requests).toBe(3);
  });

  it("returns byTeam rows from the grouped team query", async () => {
    _byTeamRows = [
      {
        teamId: "t-1",
        teamName: "Ops",
        requests: 2,
        inputTokens: 20,
        outputTokens: 10,
        costUsd: "0.02",
      },
    ];
    _totalRows = [
      { requests: 2, inputTokens: 20, outputTokens: 10, costUsd: "0.02" },
    ];

    const { getComplianceUsageSummary } = await import("./teams");
    const summary = await getComplianceUsageSummary({});
    expect(summary.byTeam).toHaveLength(1);
    expect(summary.byTeam[0].teamId).toBe("t-1");
    expect(summary.byTeam[0].teamName).toBe("Ops");
  });

  it("returns the totals row as total", async () => {
    _totalRows = [
      { requests: 9, inputTokens: 900, outputTokens: 450, costUsd: "9.99" },
    ];

    const { getComplianceUsageSummary } = await import("./teams");
    const summary = await getComplianceUsageSummary({});
    expect(summary.total).toEqual({
      requests: 9,
      inputTokens: 900,
      outputTokens: 450,
      costUsd: "9.99",
    });
  });

  it("falls back to a zeroed total when the totals query returns no row", async () => {
    _totalRows = [];

    const { getComplianceUsageSummary } = await import("./teams");
    const summary = await getComplianceUsageSummary({});
    expect(summary.total).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0",
    });
  });

  it("applies from/to/teamId/userId filters when provided", async () => {
    const { gte, lte, eq } = await import("drizzle-orm");
    const { getComplianceUsageSummary } = await import("./teams");
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    await getComplianceUsageSummary({ from, to, teamId: "t-2", userId: "u-2" });

    expect(vi.mocked(gte)).toHaveBeenCalledWith("createdAt", from);
    expect(vi.mocked(lte)).toHaveBeenCalledWith("createdAt", to);
    expect(vi.mocked(eq)).toHaveBeenCalledWith("teamId", "t-2");
    expect(vi.mocked(eq)).toHaveBeenCalledWith("userId", "u-2");
  });

  it("builds no where condition when no filters are provided", async () => {
    const { and } = await import("drizzle-orm");
    const { getComplianceUsageSummary } = await import("./teams");
    await getComplianceUsageSummary();
    expect(vi.mocked(and)).not.toHaveBeenCalled();
    expect(whereMock).toHaveBeenCalledWith(undefined);
  });
});
