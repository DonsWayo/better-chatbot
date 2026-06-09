import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, exportUserDataMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  exportUserDataMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/compliance/gdpr", () => ({ exportUserData: exportUserDataMock }));

function makeRequest(): NextRequest {
  return { headers: new Headers() } as unknown as NextRequest;
}

describe("GET /api/admin/users/[id]/data-export", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with JSON export for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    exportUserDataMock.mockResolvedValue({ exportedAt: "2026-01-01", userId: "u3", profile: {}, chatThreads: [] });

    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u3" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("gdpr-export-u3");
  });

  it("calls exportUserData with the correct userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    exportUserDataMock.mockResolvedValue({ exportedAt: "2026-01-01", userId: "u4", profile: null, chatThreads: [] });

    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u4" }) });
    expect(exportUserDataMock).toHaveBeenCalledWith("u4");
  });
});
