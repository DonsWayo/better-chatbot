import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, checkAccessMock, deleteByIdMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  deleteByIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: {
    checkAccess: checkAccessMock,
    deleteById: deleteByIdMock,
  },
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("DELETE /api/export/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls checkAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user does not own export", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(403);
  });

  it("never calls deleteById when forbidden", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(deleteByIdMock).not.toHaveBeenCalled();
  });

  it("deletes export and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteByIdMock).toHaveBeenCalledWith("ex-1");
  });

  it("passes correct export id to deleteById", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "export-unique-abc" }) });
    expect(deleteByIdMock).toHaveBeenCalledWith("export-unique-abc");
  });

  it("passes correct userId to checkAccess", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz-456" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-2" }) });
    expect(checkAccessMock).toHaveBeenCalledWith("ex-2", "user-xyz-456");
  });

  it("returns 500 when deleteById throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockRejectedValueOnce(new Error("DB error"));
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(500);
  });

  it("error body has error field on 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockRejectedValueOnce(new Error("connection lost"));
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("deleteById called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(deleteByIdMock).toHaveBeenCalledTimes(1);
  });

  it("checkAccess called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(checkAccessMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/export/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls deleteById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(deleteByIdMock).not.toHaveBeenCalled();
  });

  it("500 body error contains db error message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockRejectedValueOnce(new Error("specific timeout error"));
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-err" }) });
    const body = await res.json();
    expect(body.error).toContain("specific timeout error");
  });

  it("200 body has success:true on valid delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteByIdMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-ok" }) });
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
