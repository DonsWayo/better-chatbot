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

  it("never calls getUser when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("returns 200 for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserMock.mockResolvedValueOnce({ id: "u1", name: "Alice" });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
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

  it("passes correct userId to getUser", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz-999" } });
    getUserMock.mockResolvedValueOnce({ id: "user-xyz-999" });
    const { GET } = await import("./route");
    await GET();
    expect(getUserMock).toHaveBeenCalledWith("user-xyz-999");
  });

  it("preserves all user fields in response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const USER = { id: "u1", name: "Alice", email: "alice@example.com", role: "admin", createdAt: "2025-01-01" };
    getUserMock.mockResolvedValueOnce(USER);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.name).toBe("Alice");
    expect(body.email).toBe("alice@example.com");
    expect(body.role).toBe("admin");
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserMock.mockRejectedValueOnce(new Error("DB timeout"));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("error body includes error field on 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserMock.mockRejectedValueOnce(new Error("connection lost"));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("calls getUser exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserMock.mockResolvedValueOnce({ id: "u1" });
    const { GET } = await import("./route");
    await GET();
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it("401 response body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("500 error message includes the thrown error message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getUserMock.mockRejectedValueOnce(new Error("specific db failure"));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.error).toContain("specific db failure");
  });
});
