import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const {
  getSessionMock,
  getUserIdMock,
  selectCommentsByExportIdMock,
  insertCommentMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserIdMock: vi.fn(),
  selectCommentsByExportIdMock: vi.fn(),
  insertCommentMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: {
    selectCommentsByExportId: selectCommentsByExportIdMock,
    insertComment: insertCommentMock,
  },
}));
vi.mock("@/app/api/chat/actions", () => ({ getUserId: getUserIdMock }));
vi.mock("app-types/chat-export", () => ({
  ChatExportCommentCreateSchema: { parse: (b: unknown) => b },
}));

function makeRequest(body?: unknown): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest;
}

describe("GET /api/export/[id]/comments", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns comments (no auth required)", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("not authed"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([{ id: "c-1", content: "Nice!" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("passes exportId to selectCommentsByExportId", async () => {
    getUserIdMock.mockResolvedValueOnce("u-guest");
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "export-unique-111" }) });
    expect(selectCommentsByExportIdMock).toHaveBeenCalledWith("export-unique-111", expect.anything());
  });

  it("passes resolved userId when available", async () => {
    getUserIdMock.mockResolvedValueOnce("user-logged-in");
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ex-99" }) });
    expect(selectCommentsByExportIdMock).toHaveBeenCalledWith("ex-99", "user-logged-in");
  });

  it("returns empty array when no comments exist", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("not authed"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "empty-ex" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 500 when selectCommentsByExportId throws", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockRejectedValueOnce(new Error("DB error"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/export/[id]/comments", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(401);
  });

  it("never calls insertComment when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(insertCommentMock).not.toHaveBeenCalled();
  });

  it("creates comment and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ content: "Great conversation!" }),
      { params: Promise.resolve({ id: "ex-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ exportId: "ex-1", authorId: "u1" }),
    );
  });

  it("passes parentId to insertComment when provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    insertCommentMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ content: "Reply here", parentId: "parent-c-99" }),
      { params: Promise.resolve({ id: "ex-2" }) },
    );
    expect(insertCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "parent-c-99" }),
    );
  });

  it("returns 500 when insertComment throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockRejectedValueOnce(new Error("DB error"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(500);
  });
});
