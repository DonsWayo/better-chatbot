import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetAuditLog } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetAuditLog: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));
vi.mock("lib/admin/audit", () => ({
  getAuditLog: mockGetAuditLog,
  COMPLIANCE_AUDIT_DEFAULT_LIMIT: 100,
  COMPLIANCE_AUDIT_MAX_LIMIT: 1000,
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/compliance/audit");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as NextRequest;
}

describe("GET /api/admin/compliance/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuditLog.mockResolvedValue({ rows: [], total: 0 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("returns 200 with { items, total, limit, offset } shape", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockGetAuditLog.mockResolvedValue({
      rows: [
        {
          id: "a1",
          userId: "u1",
          userEmail: "a@b.c",
          teamId: null,
          actorType: "agent",
          agentSessionId: "as-1",
          eventType: "tool_call",
          details: {},
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("limit");
    expect(body).toHaveProperty("offset");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].actorType).toBe("agent");
    expect(body.total).toBe(1);
  });

  it("defaults limit to 100 and offset to 0", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, offset: 0 }),
    );
    const body = await res.json();
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
  });

  it("clamps limit to 1000", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest({ limit: "999999" }));
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1000 }),
    );
  });

  it("passes offset through to the lib", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest({ offset: "250" }));
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 250 }),
    );
  });

  it("passes actorType and agentSessionId filters to the lib", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest({ actorType: "agent", agentSessionId: "as-9" }));
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "agent", agentSessionId: "as-9" }),
    );
  });

  it("returns 400 for invalid actorType", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ actorType: "robot" }));
    expect(res.status).toBe(400);
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("passes from/to as Date objects to the lib", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(
      makeRequest({ from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" }),
    );
    const args = mockGetAuditLog.mock.calls[0][0];
    expect(args.from).toBeInstanceOf(Date);
    expect(args.to).toBeInstanceOf(Date);
    expect(args.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns 400 for invalid from date", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ from: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("passes userId, teamId and eventType filters to the lib", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(
      makeRequest({ userId: "u-2", teamId: "t-1", eventType: "admin_action" }),
    );
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-2",
        teamId: "t-1",
        eventType: "admin_action",
      }),
    );
  });

  it("clamps minimum limit to 1", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest({ limit: "0" }));
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });
});
