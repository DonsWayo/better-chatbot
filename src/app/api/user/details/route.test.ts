import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, getUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/user/server", () => ({ getUser: getUserMock }));

describe("GET /api/user/details", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty object when user not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns user details for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const USER = { id: "u1", name: "Alice", email: "alice@example.com" };
    getUserMock.mockResolvedValueOnce(USER);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("u1");
    expect(getUserMock).toHaveBeenCalledWith("u1");
  });
});
