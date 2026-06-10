import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetComplianceUsageSummary } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetComplianceUsageSummary: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));
vi.mock("lib/admin/teams", () => ({
  getComplianceUsageSummary: mockGetComplianceUsageSummary,
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/compliance/usage");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as NextRequest;
}

const SUMMARY = {
  byModel: [
    {
      model: "claude-sonnet-4-5",
      requests: 10,
      inputTokens: 5000,
      outputTokens: 2500,
      costUsd: "1.250000",
    },
  ],
  byTeam: [
    {
      teamId: "t-1",
      teamName: "Engineering",
      requests: 10,
      inputTokens: 5000,
      outputTokens: 2500,
      costUsd: "1.250000",
    },
  ],
  total: {
    requests: 10,
    inputTokens: 5000,
    outputTokens: 2500,
    costUsd: "1.250000",
  },
};

describe("GET /api/admin/compliance/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComplianceUsageSummary.mockResolvedValue(SUMMARY);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockGetComplianceUsageSummary).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(mockGetComplianceUsageSummary).not.toHaveBeenCalled();
  });

  it("returns the aggregation shape { byModel, byTeam, total }", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byModel).toHaveLength(1);
    expect(body.byModel[0]).toEqual(
      expect.objectContaining({
        model: "claude-sonnet-4-5",
        requests: 10,
        inputTokens: 5000,
        outputTokens: 2500,
        costUsd: "1.250000",
      }),
    );
    expect(body.byTeam[0]).toEqual(
      expect.objectContaining({ teamId: "t-1", teamName: "Engineering" }),
    );
    expect(body.total).toEqual(
      expect.objectContaining({ requests: 10, costUsd: "1.250000" }),
    );
  });

  it("passes from/to as Dates and teamId/userId through to the lib", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(
      makeRequest({
        from: "2026-01-01",
        to: "2026-03-01",
        teamId: "t-7",
        userId: "u-7",
      }),
    );
    const args = mockGetComplianceUsageSummary.mock.calls[0][0];
    expect(args.from).toBeInstanceOf(Date);
    expect(args.to).toBeInstanceOf(Date);
    expect(args.teamId).toBe("t-7");
    expect(args.userId).toBe("u-7");
  });

  it("returns 400 for invalid from date", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ from: "garbage" }));
    expect(res.status).toBe(400);
    expect(mockGetComplianceUsageSummary).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid to date", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ to: "garbage" }));
    expect(res.status).toBe(400);
  });

  it("omits filters that are not provided", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest());
    const args = mockGetComplianceUsageSummary.mock.calls[0][0];
    expect(args.from).toBeUndefined();
    expect(args.to).toBeUndefined();
    expect(args.teamId).toBeUndefined();
    expect(args.userId).toBeUndefined();
  });
});
