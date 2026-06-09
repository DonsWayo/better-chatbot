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

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("500 body has error field when insertComment throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockRejectedValueOnce(new Error("insert failed"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("insertComment called exactly once per authenticated POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(insertCommentMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/export/[id]/comments — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("selectCommentsByExportId called exactly once per GET", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(selectCommentsByExportIdMock).toHaveBeenCalledTimes(1);
  });

  it("500 body has error field when selectCommentsByExportId throws", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockRejectedValueOnce(new Error("DB error"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("200 body is an array", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });
});

describe("POST /api/export/[id]/comments — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has success field as boolean true", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("response is a Response instance even on 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    insertCommentMock.mockRejectedValueOnce(new Error("DB error"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: "hello" }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res).toBeInstanceOf(Response);
  });
});

describe("GET /api/export/[id]/comments — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance for 200", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 500", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockRejectedValueOnce(new Error("DB error"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is an array when comment count is zero", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-1" }) });
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("selectCommentsByExportId called with correct exportId", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "export-shape-check" }) });
    expect(selectCommentsByExportIdMock).toHaveBeenCalledWith("export-shape-check", expect.anything());
  });
});

describe("GET and POST /api/export/[id]/comments — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); selectCommentsByExportIdMock.mockResolvedValue([]); });

  it("selectCommentsByExportId called exactly once per GET", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ex-cc-1" }) });
    expect(selectCommentsByExportIdMock).toHaveBeenCalledTimes(1);
  });

  it("insertComment never called when POST unauthenticated", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    const { POST } = await import("./route");
    await POST(makeRequest({ content: { type: "doc", content: [] } }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(insertCommentMock).not.toHaveBeenCalled();
  });

  it("GET always returns a Response instance", async () => {
    selectCommentsByExportIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ex-resp" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("POST returns Response instance when unauthenticated", async () => {
    getUserIdMock.mockRejectedValueOnce(new Error("no user"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ content: { type: "doc", content: [] } }), { params: Promise.resolve({ id: "ex-1" }) });
    expect(res).toBeInstanceOf(Response);
  });
});
