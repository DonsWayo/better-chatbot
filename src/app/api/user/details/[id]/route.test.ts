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

  it("returns 403 when user cannot manage the target", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2", role: "user" } });
    canManageUserMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "u-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns user details when permitted", async () => {
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
});
