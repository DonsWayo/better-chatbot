import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, getUserMock, canManageUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  canManageUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/user/server", () => ({ getUser: getUserMock }));
vi.mock("lib/auth/permissions", () => ({ canManageUser: canManageUserMock }));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/user/details/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls canManageUser when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(canManageUserMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user cannot manage the target", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    canManageUserMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(res.status).toBe(403);
  });

  it("never calls getUser when forbidden", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    canManageUserMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("returns 200 with user details when permitted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    canManageUserMock.mockResolvedValueOnce(true);
    const USER = { id: "u-1", name: "Bob", email: "bob@example.com" };
    getUserMock.mockResolvedValueOnce(USER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("u-1");
  });

  it("passes correct id to canManageUser", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1" } });
    canManageUserMock.mockResolvedValueOnce(true);
    getUserMock.mockResolvedValueOnce({ id: "target-user-567" });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "target-user-567" }) });
    expect(canManageUserMock).toHaveBeenCalledWith("target-user-567");
  });

  it("passes correct id to getUser", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1" } });
    canManageUserMock.mockResolvedValueOnce(true);
    getUserMock.mockResolvedValueOnce({ id: "target-user-567" });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "target-user-567" }) });
    expect(getUserMock).toHaveBeenCalledWith("target-user-567");
  });

  it("returns empty object when user not found but permitted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1" } });
    canManageUserMock.mockResolvedValueOnce(true);
    getUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("preserves all user fields in response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    canManageUserMock.mockResolvedValueOnce(true);
    const USER = { id: "u-1", name: "Bob", email: "bob@example.com", role: "user" };
    getUserMock.mockResolvedValueOnce(USER);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    const body = await res.json();
    expect(body.name).toBe("Bob");
    expect(body.email).toBe("bob@example.com");
    expect(body.role).toBe("user");
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1" } });
    canManageUserMock.mockRejectedValueOnce(new Error("permission check failed"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(res.status).toBe(500);
  });
});
