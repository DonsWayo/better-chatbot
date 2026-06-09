import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAdminPermissionMock, dbSelectMock, dbInsertMock } = vi.hoisted(() => ({
  requireAdminPermissionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
}));

vi.mock("lib/auth/permissions", () => ({ requireAdminPermission: requireAdminPermissionMock }));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectLimitMock = vi.fn().mockReturnValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: dbSelectLimitMock }) });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbInsertReturningMock = vi.fn().mockResolvedValue([]);
const dbInsertOnConflictMock = vi.fn().mockReturnValue({ returning: dbInsertReturningMock });
const dbInsertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: dbInsertOnConflictMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, insert: dbInsertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeTeamBudgetTable: { teamId: "teamId", periodStart: "periodStart", periodEnd: "periodEnd", budgetUsd: "budgetUsd" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  lte: vi.fn((_a: unknown, _b: unknown) => ({})),
  gte: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/admin/teams/[id]/budget", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns null budget when none active", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget).toBeNull();
  });

  it("returns active budget", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([{
      id: "b-1", teamId: "t-1", budgetUsd: "500.00", usedUsd: "120.00",
    }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget.budgetUsd).toBe("500.00");
  });
});

describe("POST /api/admin/teams/[id]/budget", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ budgetUsd: "not-money" }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when periodEnd before periodStart", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({
      budgetUsd: "100.00",
      periodStart: "2026-07-01",
      periodEnd: "2026-06-01",
    }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/periodEnd/);
  });

  it("creates/upserts budget and returns 200", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbInsertReturningMock.mockResolvedValueOnce([{
      id: "b-new", teamId: "t-1", budgetUsd: "200.00",
    }]);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({
      budgetUsd: "200.00",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    }), { params: Promise.resolve({ id: "t-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget.budgetUsd).toBe("200.00");
  });
});
