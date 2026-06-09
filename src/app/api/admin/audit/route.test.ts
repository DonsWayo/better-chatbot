import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockGetSession, mockGetAuditLog } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetAuditLog: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));
vi.mock("lib/admin/audit", () => ({ getAuditLog: mockGetAuditLog }));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/audit");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as NextRequest;
}

describe("GET /api/admin/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuditLog.mockResolvedValue({ rows: [], total: 0 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid from date", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ from: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid to date", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ to: "banana" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with rows and total for admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const fakeRows = [
      { id: "a1", userId: "u1", userEmail: null, teamId: null, eventType: "chat_request", details: {}, createdAt: new Date() },
    ];
    mockGetAuditLog.mockResolvedValue({ rows: fakeRows, total: 1 });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it("passes eventType filter to getAuditLog", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest({ eventType: "guardrail_firing" }));
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "guardrail_firing" }),
    );
  });

  it("caps limit at 200", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await GET(makeRequest({ limit: "9999" }));
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
  });

  it("returns page and limit in response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ page: "2", limit: "25" }));
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.limit).toBe(25);
  });

  it("never calls getAuditLog when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("never calls getAuditLog when role is not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("returns rows array and total in 200 response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("defaults page to 1 when not provided", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.page).toBe(1);
  });
});
