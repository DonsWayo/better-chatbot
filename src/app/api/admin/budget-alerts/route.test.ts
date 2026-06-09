import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbSelectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectInnerJoinMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
const dbSelectFromMock = vi.fn().mockReturnValue({ innerJoin: dbSelectInnerJoinMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeTeamBudgetTable: { teamId: "teamId", usedUsd: "usedUsd", budgetUsd: "budgetUsd", periodStart: "periodStart", periodEnd: "periodEnd" },
  AsafeTeamTable: { id: "id", name: "name" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  lte: vi.fn((_a: unknown, _b: unknown) => ({})),
  gte: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

describe("GET /api/admin/budget-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectFromMock.mockReturnValue({ innerJoin: dbSelectInnerJoinMock });
    dbSelectInnerJoinMock.mockReturnValue({ where: dbSelectWhereMock });
    dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
  });

  it("returns 403 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns empty alerts list when no budgets active", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toHaveLength(0);
  });

  it("flags teams over 80% utilisation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { teamId: "t-1", teamName: "Engineering", budgetUsd: "100.00", usedUsd: "85.00", periodStart: new Date(), periodEnd: new Date() },
      { teamId: "t-2", teamName: "Design", budgetUsd: "50.00", usedUsd: "10.00", periodStart: new Date(), periodEnd: new Date() },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toHaveLength(2);
    const eng = body.alerts.find((a: any) => a.teamId === "t-1");
    const design = body.alerts.find((a: any) => a.teamId === "t-2");
    expect(eng.alert).toBe(true);
    expect(design.alert).toBe(false);
  });

  it("includes utilizationRatio in each alert", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { teamId: "t-3", teamName: "QA", budgetUsd: "200.00", usedUsd: "100.00", periodStart: new Date(), periodEnd: new Date() },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    const qa = body.alerts[0];
    expect(qa.utilizationRatio).toBeCloseTo(0.5);
  });

  it("alerts at exactly 80% boundary", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbSelectWhereMock.mockResolvedValueOnce([
      { teamId: "t-4", teamName: "DevOps", budgetUsd: "100.00", usedUsd: "80.00", periodStart: new Date(), periodEnd: new Date() },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.alerts[0].alert).toBe(true);
  });
});
