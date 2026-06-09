import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── hoisted mocks ──────────────────────────────────────────────────────────────

const { mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mockSelect, update: mockUpdate },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeTeamBudgetTable: {
    id: "id",
    teamId: "teamId",
    periodStart: "periodStart",
    periodEnd: "periodEnd",
    budgetUsd: "budgetUsd",
    usedUsd: "usedUsd",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  lt: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn() }),
  },
}));

// ── helpers ────────────────────────────────────────────────────────────────────

function makeRequest(secret?: string): NextRequest {
  const headers = new Headers();
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  return { headers, nextUrl: new URL("http://localhost/api/cron/budget-reset") } as unknown as NextRequest;
}

describe("POST /api/cron/budget-reset", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" };

    const updateWhereMock = vi.fn().mockResolvedValue([]);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockUpdate.mockReturnValue({ set: updateSetMock });

    // Default: no expired budgets
    const selectWhereMock = vi.fn().mockResolvedValue([]);
    const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
    mockSelect.mockReturnValue({ from: selectFromMock });
  });

  it("returns 401 when no auth header", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong secret", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET env is not set", async () => {
    process.env.CRON_SECRET = "";
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    expect(res.status).toBe(401);
  });

  it("returns { reset: 0 } when no expired budgets", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reset).toBe(0);
  });

  it("resets one expired budget and returns { reset: 1 }", async () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-06-01T00:00:00.000Z");
    const expiredBudget = { id: "b1", teamId: "t1", periodStart: start, periodEnd: end, budgetUsd: "100.00", usedUsd: "50.00" };

    const updateWhereMock = vi.fn().mockResolvedValue([]);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockUpdate.mockReturnValue({ set: updateSetMock });

    const selectWhereMock = vi.fn().mockResolvedValue([expiredBudget]);
    const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
    mockSelect.mockReturnValue({ from: selectFromMock });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reset).toBe(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ usedUsd: "0" }),
    );
  });

  it("advances period by same interval (30 days → next 30 days)", async () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-05-31T00:00:00.000Z"); // 30 days
    const expiredBudget = { id: "b2", teamId: "t2", periodStart: start, periodEnd: end, budgetUsd: "50.00", usedUsd: "25.00" };

    const capturedSet: unknown[] = [];
    const updateWhereMock = vi.fn().mockResolvedValue([]);
    const updateSetMock = vi.fn((v) => { capturedSet.push(v); return { where: updateWhereMock }; });
    mockUpdate.mockReturnValue({ set: updateSetMock });

    const selectWhereMock = vi.fn().mockResolvedValue([expiredBudget]);
    const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
    mockSelect.mockReturnValue({ from: selectFromMock });

    const { POST } = await import("./route");
    await POST(makeRequest("test-secret"));

    expect(capturedSet).toHaveLength(1);
    const setCall = capturedSet[0] as Record<string, unknown>;
    const newStart = setCall.periodStart as Date;
    const newEnd = setCall.periodEnd as Date;
    const interval = newEnd.getTime() - newStart.getTime();
    const expected = end.getTime() - start.getTime();
    expect(interval).toBe(expected);
    expect(newStart.getTime()).toBe(end.getTime());
  });

  it("resets multiple expired budgets", async () => {
    const b1 = { id: "b1", teamId: "t1", periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-05-01"), budgetUsd: "100", usedUsd: "90" };
    const b2 = { id: "b2", teamId: "t2", periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-05-01"), budgetUsd: "200", usedUsd: "180" };

    const updateWhereMock = vi.fn().mockResolvedValue([]);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockUpdate.mockReturnValue({ set: updateSetMock });

    const selectWhereMock = vi.fn().mockResolvedValue([b1, b2]);
    const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
    mockSelect.mockReturnValue({ from: selectFromMock });

    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();

    expect(body.reset).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("never calls db update when unauthorized", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest("wrong-secret"));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("never calls db select when unauthorized", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("200 body has reset property as number", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest("test-secret"));
    const body = await res.json();
    expect(typeof body.reset).toBe("number");
  });

  it("401 body has error field when no auth header", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
