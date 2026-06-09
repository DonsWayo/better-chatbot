import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { getSessionMock, chatExportRepositoryMock, getUserIdMock } = vi.hoisted(
  () => ({
    getSessionMock: vi.fn(),
    chatExportRepositoryMock: {
      selectCommentsByExportId: vi.fn(),
      insertComment: vi.fn(),
    },
    getUserIdMock: vi.fn(),
  }),
);

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: chatExportRepositoryMock,
}));
vi.mock("@/app/api/chat/actions", () => ({ getUserId: getUserIdMock }));

import { GET, POST } from "./route";

const makeContext = (id: string) => ({
  params: Promise.resolve({ id }),
});

const makeRequest = (body?: unknown) =>
  new NextRequest("http://localhost", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/export/[id]/comments", () => {
  it("returns 200 with comments", async () => {
    getUserIdMock.mockResolvedValue("user-1");
    chatExportRepositoryMock.selectCommentsByExportId.mockResolvedValue([
      { id: "c-1", content: {} },
    ]);
    const res = await GET(makeRequest(), makeContext("exp-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("calls repository with export id and user id", async () => {
    getUserIdMock.mockResolvedValue("user-99");
    chatExportRepositoryMock.selectCommentsByExportId.mockResolvedValue([]);
    await GET(makeRequest(), makeContext("exp-abc"));
    expect(chatExportRepositoryMock.selectCommentsByExportId).toHaveBeenCalledWith(
      "exp-abc",
      "user-99",
    );
  });

  it("passes undefined userId when getUserId rejects", async () => {
    getUserIdMock.mockRejectedValue(new Error("No session"));
    chatExportRepositoryMock.selectCommentsByExportId.mockResolvedValue([]);
    const res = await GET(makeRequest(), makeContext("exp-1"));
    expect(res.status).toBe(200);
    expect(chatExportRepositoryMock.selectCommentsByExportId).toHaveBeenCalledWith(
      "exp-1",
      undefined,
    );
  });

  it("returns empty array when no comments", async () => {
    getUserIdMock.mockResolvedValue("user-1");
    chatExportRepositoryMock.selectCommentsByExportId.mockResolvedValue([]);
    const res = await GET(makeRequest(), makeContext("exp-1"));
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 500 on repository error", async () => {
    getUserIdMock.mockResolvedValue("user-1");
    chatExportRepositoryMock.selectCommentsByExportId.mockRejectedValue(
      new Error("DB error"),
    );
    const res = await GET(makeRequest(), makeContext("exp-1"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/export/[id]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: { type: "doc", content: [] } }), makeContext("exp-1"));
    expect(res.status).toBe(401);
  });

  it("returns Unauthorized body when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ content: { type: "doc", content: [] } }), makeContext("exp-1"));
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("inserts comment and returns success for valid request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);
    const res = await POST(
      makeRequest({ content: { type: "doc", content: [] } }),
      makeContext("exp-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls insertComment with exportId from params", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);
    await POST(
      makeRequest({ content: { type: "doc", content: [] } }),
      makeContext("exp-xyz"),
    );
    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "exp-xyz" }),
    );
  });

  it("calls insertComment with authorId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);
    await POST(
      makeRequest({ content: { type: "doc", content: [] } }),
      makeContext("exp-1"),
    );
    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "user-42" }),
    );
  });

  it("passes parentId from request body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockResolvedValue(undefined);
    await POST(
      makeRequest({
        content: { type: "doc", content: [] },
        parentId: "parent-123",
      }),
      makeContext("exp-1"),
    );
    expect(chatExportRepositoryMock.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent-123" }),
    );
  });

  it("returns 500 on repository error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatExportRepositoryMock.insertComment.mockRejectedValue(new Error("DB fail"));
    const res = await POST(
      makeRequest({ content: { type: "doc", content: [] } }),
      makeContext("exp-1"),
    );
    expect(res.status).toBe(500);
  });
});
