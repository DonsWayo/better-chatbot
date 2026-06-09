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

  it("returns 403 when user does not own the comment", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkCommentAccessMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ex-1", commentId: "c-1" }) });
    expect(res.status).toBe(403);
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
});
