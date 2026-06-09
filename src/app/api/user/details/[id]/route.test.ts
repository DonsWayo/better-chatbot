import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, getUserMock, canManageUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
  canManageUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/user/server", () => ({ getUser: getUserMock }));
vi.mock("lib/auth/permissions", () => ({ canManageUser: canManageUserMock }));

import { GET } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });

const USER = { id: "user-1", name: "Alice", email: "alice@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/user/details/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot manage target user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    canManageUserMock.mockResolvedValue(false);
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns user details when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(USER);
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("user-1");
    expect(body.name).toBe("Alice");
  });

  it("calls canManageUser with the target user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-admin" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(USER);
    await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-target"),
    );
    expect(canManageUserMock).toHaveBeenCalledWith("user-target");
  });

  it("calls getUser with the target user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(USER);
    await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-42"),
    );
    expect(getUserMock).toHaveBeenCalledWith("user-42");
  });

  it("returns empty object when user not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockRejectedValue(new Error("Permission check failed"));
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Permission check failed");
  });

  it("returns email from user object", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(USER);
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    const body = await res.json();
    expect(body.email).toBe("alice@example.com");
  });

  it("does not call getUser when canManageUser returns false", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    canManageUserMock.mockResolvedValue(false);
    await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(USER);
    const res = await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("calls canManageUser exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canManageUserMock.mockResolvedValue(true);
    getUserMock.mockResolvedValue(USER);
    await GET(
      new Request("http://x") as Parameters<typeof GET>[0],
      makeContext("user-1"),
    );
    expect(canManageUserMock).toHaveBeenCalledTimes(1);
  });
});
