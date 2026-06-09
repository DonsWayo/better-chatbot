import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, revokeUserModelGrantMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  revokeUserModelGrantMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/user-grants", () => ({ revokeUserModelGrant: revokeUserModelGrantMock }));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("DELETE /api/admin/users/[id]/model-grants/[grantId]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls revokeUserModelGrant when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(revokeUserModelGrantMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(res.status).toBe(403);
  });

  it("never calls revokeUserModelGrant for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(revokeUserModelGrantMock).not.toHaveBeenCalled();
  });

  it("revokes grant and returns ok for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    revokeUserModelGrantMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("calls revokeUserModelGrant with correct grantId and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    revokeUserModelGrantMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(revokeUserModelGrantMock).toHaveBeenCalledWith("g-1", "u-1");
  });

  it("passes correct grantId from params", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    revokeUserModelGrantMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "user-789", grantId: "grant-unique-456" }) });
    expect(revokeUserModelGrantMock).toHaveBeenCalledWith("grant-unique-456", "user-789");
  });

  it("response body has ok: true on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    revokeUserModelGrantMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);
  });

  it("401 response body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 response body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("revokeUserModelGrant called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    revokeUserModelGrantMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(revokeUserModelGrantMock).toHaveBeenCalledTimes(1);
  });

  it("never calls revokeUserModelGrant for editor role", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "e1", role: "editor" } });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "u-1", grantId: "g-1" }) });
    expect(revokeUserModelGrantMock).not.toHaveBeenCalled();
  });
});
