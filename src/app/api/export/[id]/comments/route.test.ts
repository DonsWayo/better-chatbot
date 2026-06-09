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
});

describe("POST /api/export/[id]/comments", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res.status).toBe(401);
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
});
