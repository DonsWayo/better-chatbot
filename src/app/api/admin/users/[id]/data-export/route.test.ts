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

  it("never calls exportUserData when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u1" }) });
    expect(exportUserDataMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(403);
  });

  it("never calls exportUserData for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(exportUserDataMock).not.toHaveBeenCalled();
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

  it("export response body contains exported data from exportUserData", async () => {
    const exportData = { exportedAt: "2026-06-01", userId: "u5", profile: { name: "Eve" }, chatThreads: [{ id: "t-1" }] };
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    exportUserDataMock.mockResolvedValueOnce(exportData);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u5" }) });
    const body = await res.json();
    expect(body.userId).toBe("u5");
    expect(body.profile.name).toBe("Eve");
    expect(body.chatThreads).toHaveLength(1);
  });

  it("401 response has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("calls exportUserData exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    exportUserDataMock.mockResolvedValue({ exportedAt: "2026-01-01", userId: "u9" });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u9" }) });
    expect(exportUserDataMock).toHaveBeenCalledTimes(1);
  });

  it("content-disposition header contains the target user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    exportUserDataMock.mockResolvedValue({ exportedAt: "2026-01-01", userId: "target-user-x" });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "target-user-x" }) });
    expect(res.headers.get("content-disposition")).toContain("target-user-x");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls exportUserData for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(exportUserDataMock).not.toHaveBeenCalled();
  });
});
