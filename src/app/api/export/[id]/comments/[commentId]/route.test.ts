import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { getSessionMock, chatExportRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatExportRepositoryMock: {
    checkCommentAccess: vi.fn(),
    deleteComment: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: chatExportRepositoryMock,
}));

import { DELETE } from "./route";

const makeContext = (id: string, commentId: string) => ({
  params: Promise.resolve({ id, commentId }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/export/[id]/comments/[commentId]", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns Unauthorized body when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks comment access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(false);
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns Forbidden in body when access denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(false);
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 success when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteComment.mockResolvedValue(undefined);
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls checkCommentAccess with commentId and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteComment.mockResolvedValue(undefined);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-1", "c-xyz"));
    expect(chatExportRepositoryMock.checkCommentAccess).toHaveBeenCalledWith(
      "c-xyz",
      "user-42",
    );
  });

  it("calls deleteComment with commentId and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteComment.mockResolvedValue(undefined);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-1", "c-abc"));
    expect(chatExportRepositoryMock.deleteComment).toHaveBeenCalledWith(
      "c-abc",
      "user-1",
    );
  });

  it("does not call deleteComment when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(false);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-1", "c-1"));
    expect(chatExportRepositoryMock.deleteComment).not.toHaveBeenCalled();
  });

  it("returns 500 when checkCommentAccess throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockRejectedValue(
      new Error("DB error"),
    );
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    expect(res.status).toBe(500);
  });

  it("includes error message in 500 response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockRejectedValue(
      new Error("Timeout"),
    );
    const res = await DELETE(
      new NextRequest("http://localhost"),
      makeContext("exp-1", "c-1"),
    );
    const body = await res.json();
    expect(body.error).toBe("Timeout");
  });

  it("calls checkCommentAccess exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteComment.mockResolvedValue(undefined);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-1", "c-1"));
    expect(chatExportRepositoryMock.checkCommentAccess).toHaveBeenCalledTimes(1);
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.checkCommentAccess.mockResolvedValue(true);
    chatExportRepositoryMock.deleteComment.mockResolvedValue(undefined);
    const res = await DELETE(new NextRequest("http://localhost"), makeContext("exp-1", "c-1"));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not call checkCommentAccess when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await DELETE(new NextRequest("http://localhost"), makeContext("exp-1", "c-1"));
    expect(chatExportRepositoryMock.checkCommentAccess).not.toHaveBeenCalled();
  });
});
