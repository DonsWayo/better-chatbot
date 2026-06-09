import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, getUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/user/server", () => ({ getUser: getUserMock }));

import { GET } from "./route";

const USER = { id: "user-1", name: "Alice", email: "alice@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/user/details", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns user details when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserMock.mockResolvedValue(USER);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("user-1");
    expect(body.name).toBe("Alice");
  });

  it("calls getUser with user id from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    getUserMock.mockResolvedValue(USER);
    await GET();
    expect(getUserMock).toHaveBeenCalledWith("user-42");
  });

  it("returns empty object when user not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserMock.mockRejectedValue(new Error("DB fail"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB fail");
  });
});
