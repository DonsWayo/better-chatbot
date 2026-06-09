import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { getSessionMock, checkCommentAccessMock, deleteCommentMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkCommentAccessMock: vi.fn(),
  deleteCommentMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: {
    checkCommentAccess: checkCommentAccessMock,
    deleteComment: deleteCommentMock,
  },
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("DELETE /api/export/[id]/comments/[commentId]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls checkCommentAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(checkCommentAccessMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user does not own the comment", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res.status).toBe(403);
  });

  it("never calls deleteComment when forbidden", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(deleteCommentMock).not.toHaveBeenCalled();
  });

  it("deletes comment and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCommentMock).toHaveBeenCalledWith("c-1", "u1");
  });

  it("passes correct commentId and userId to checkCommentAccess", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc-99" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-5", commentId: "comment-xyz" }) });
    expect(checkCommentAccessMock).toHaveBeenCalledWith("comment-xyz", "user-abc-99");
  });

  it("passes correct commentId and userId to deleteComment", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-del-55" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-7", commentId: "c-unique-789" }) });
    expect(deleteCommentMock).toHaveBeenCalledWith("c-unique-789", "user-del-55");
  });

  it("returns 500 when deleteComment throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockRejectedValueOnce(new Error("DB error"));
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res.status).toBe(500);
  });

  it("401 response body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 response body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("500 response body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockRejectedValueOnce(new Error("unexpected failure"));
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("deleteComment called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(deleteCommentMock).toHaveBeenCalledTimes(1);
  });

  it("checkCommentAccess called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(checkCommentAccessMock).toHaveBeenCalledTimes(1);
  });

  it("never calls deleteComment when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(deleteCommentMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/export/[id]/comments/[commentId] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("500 body error contains the thrown message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockRejectedValueOnce(new Error("foreign key violation"));
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    const body = await res.json();
    expect(body.error).toContain("foreign key violation");
  });

  it("200 body has success:true on valid delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(true);
    deleteCommentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-8", commentId: "c-8" }) });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("checkCommentAccess never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(checkCommentAccessMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/export/[id]/comments/[commentId] — guard chain", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("checkCommentAccess called with commentId before deleteComment", async () => {
    const callOrder: string[] = [];
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockImplementationOnce(async () => { callOrder.push("check"); return true; });
    deleteCommentMock.mockImplementationOnce(async () => { callOrder.push("delete"); });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(callOrder[0]).toBe("check");
    expect(callOrder[1]).toBe("delete");
  });

  it("returns 401 when session has no user object", async () => {
    getSessionMock.mockResolvedValue({ user: null });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/export/[id]/comments/[commentId] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("checkCommentAccess not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(checkCommentAccessMock).not.toHaveBeenCalled();
  });

  it("deleteComment not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(deleteCommentMock).not.toHaveBeenCalled();
  });

  it("DELETE returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
