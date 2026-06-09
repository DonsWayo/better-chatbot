import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, eraseUserDataMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  eraseUserDataMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/compliance/gdpr", () => ({ eraseUserData: eraseUserDataMock }));

function makeRequest(): NextRequest {
  return { headers: new Headers() } as unknown as NextRequest;
}

describe("POST /api/admin/users/[id]/erasure", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 if admin tries to erase their own account", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "admin1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot erase your own/i);
  });

  it("calls eraseUserData and returns ok for valid admin request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    eraseUserDataMock.mockResolvedValue({ tablesCleared: ["user", "chat_thread"] });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "user-to-erase" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.userId).toBe("user-to-erase");
    expect(body.tablesCleared).toEqual(["user", "chat_thread"]);
  });

  it("eraseUserData is called with the target userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    eraseUserDataMock.mockResolvedValue({ tablesCleared: [] });

    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "victim-user" }) });
    expect(eraseUserDataMock).toHaveBeenCalledWith("victim-user");
  });

  it("never calls eraseUserData when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "u1" }) });
    expect(eraseUserDataMock).not.toHaveBeenCalled();
  });

  it("never calls eraseUserData for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(eraseUserDataMock).not.toHaveBeenCalled();
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "u2" }) });
    expect(res.status).toBe(403);
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "u1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("400 body has error field when admin erases themselves", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "admin1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "admin1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
