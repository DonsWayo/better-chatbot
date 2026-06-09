import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockGetSession, mockSelect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));

// Drizzle chain: select({}).from(T).where(cond).groupBy(...).orderBy(...).limit(n)
const limitMock = vi.fn().mockResolvedValue([]);
const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
const groupByMock = vi.fn().mockReturnValue({ orderBy: orderByMock, limit: limitMock });
const whereMock = vi.fn().mockReturnValue({ groupBy: groupByMock, orderBy: orderByMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mockSelect },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeUsageEventTable: {
    model: "model",
    provider: "provider",
    teamId: "teamId",
    promptTokens: "promptTokens",
    completionTokens: "completionTokens",
    costUsd: "costUsd",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/teams/team-1/usage");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as NextRequest;
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/admin/teams/[id]/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    limitMock.mockResolvedValue([]);
    orderByMock.mockReturnValue({ limit: limitMock });
    groupByMock.mockReturnValue({ orderBy: orderByMock, limit: limitMock });
    whereMock.mockReturnValue({ groupBy: groupByMock, orderBy: orderByMock });
    fromMock.mockReturnValue({ where: whereMock });

    let call = 0;
    mockSelect.mockImplementation(() => {
      call++;
      if (call % 2 === 0) {
        // totals query (shorter chain)
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ totalRequests: 0, totalCostUsd: null, totalPromptTokens: 0, totalCompletionTokens: 0 }]),
          }),
        };
      }
      return { from: fromMock };
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    expect(res.status).toBe(403);
  });

  it("returns 200 with byModel and totals for admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("byModel");
    expect(body).toHaveProperty("totals");
    expect(body).toHaveProperty("days");
  });

  it("defaults to 30 days", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.days).toBe(30);
  });

  it("caps days at 365", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ days: "9999" }), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.days).toBe(365);
  });

  it("calls DB twice (byModel + totals)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest(), makeParams("team-1") as any);
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("never calls mockSelect when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), makeParams("team-1") as any);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("never calls mockSelect when non-admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    await GET(makeRequest(), makeParams("team-1") as any);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("custom days within range parsed correctly", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ days: "7" }), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.days).toBe(7);
  });

  it("days clamped to 1 when days=0", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ days: "0" }), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.days).toBe(1);
  });

  it("byModel in 200 response is an array", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(Array.isArray(body.byModel)).toBe(true);
  });

  it("totals in 200 response is an object", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(typeof body.totals).toBe("object");
  });

  it("getSession called exactly once per GET", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), makeParams("team-1") as any);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/teams/[id]/usage — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    limitMock.mockResolvedValue([]);
    orderByMock.mockReturnValue({ limit: limitMock });
    groupByMock.mockReturnValue({ orderBy: orderByMock, limit: limitMock });
    whereMock.mockReturnValue({ groupBy: groupByMock, orderBy: orderByMock });
    fromMock.mockReturnValue({ where: whereMock });

    let call = 0;
    mockSelect.mockImplementation(() => {
      call++;
      if (call % 2 === 0) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ totalRequests: 0, totalCostUsd: null, totalPromptTokens: 0, totalCompletionTokens: 0 }]),
          }),
        };
      }
      return { from: fromMock };
    });
  });

  it("response is always a Response instance", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    expect(res).toBeInstanceOf(Response);
  });

  it("200 days field is a number", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(typeof body.days).toBe("number");
  });

  it("negative days clamped to minimum 1", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ days: "-5" }), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.days).toBeGreaterThanOrEqual(1);
  });

  it("200 totals object has totalRequests field", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(body.totals).toHaveProperty("totalRequests");
  });
});

describe("GET /api/admin/teams/[id]/usage — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockSelect.mockReturnValue({ from: fromMock });
    limitMock.mockResolvedValue([]);
  });

  it("returns a Response instance for 401", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body teamId matches route param", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-xyz") as any);
    const body = await res.json();
    expect(body.teamId).toBe("team-xyz");
  });

  it("200 body has usageByModel array", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), makeParams("team-1") as any);
    const body = await res.json();
    expect(Array.isArray(body.usageByModel)).toBe(true);
  });
});
