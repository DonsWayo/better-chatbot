import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkItemAccessMock,
  createBookmarkMock,
  removeBookmarkMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkItemAccessMock: vi.fn(),
  createBookmarkMock: vi.fn(),
  removeBookmarkMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  bookmarkRepository: {
    checkItemAccess: checkItemAccessMock,
    createBookmark: createBookmarkMock,
    removeBookmark: removeBookmarkMock,
  },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("POST /api/bookmark", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid itemType", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when item not accessible", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkItemAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(404);
  });

  it("creates bookmark and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkItemAccessMock.mockResolvedValueOnce(true);
    createBookmarkMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "agent-1", itemType: "agent" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(createBookmarkMock).toHaveBeenCalledWith("u1", "agent-1", "agent");
  });
});

describe("DELETE /api/bookmark", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest({ itemId: "a-1", itemType: "workflow" }));
    expect(res.status).toBe(401);
  });

  it("removes bookmark and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    removeBookmarkMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest({ itemId: "wf-1", itemType: "workflow" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(removeBookmarkMock).toHaveBeenCalledWith("u1", "wf-1", "workflow");
  });

  it("returns 400 for invalid itemType", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest({ itemId: "x-1", itemType: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing itemId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest({ itemType: "agent" }));
    expect(res.status).toBe(400);
  });

  it("never calls removeBookmark when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest({ itemId: "wf-1", itemType: "workflow" }));
    expect(removeBookmarkMock).not.toHaveBeenCalled();
  });

  it("removes bookmark with agent itemType", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    removeBookmarkMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest({ itemId: "ag-5", itemType: "agent" }));
    expect(res.status).toBe(200);
    expect(removeBookmarkMock).toHaveBeenCalledWith("u2", "ag-5", "agent");
  });
});

describe("POST /api/bookmark — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls checkItemAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(checkItemAccessMock).not.toHaveBeenCalled();
  });

  it("never calls createBookmark when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(createBookmarkMock).not.toHaveBeenCalled();
  });

  it("never calls createBookmark when item not accessible", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkItemAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(createBookmarkMock).not.toHaveBeenCalled();
  });

  it("returns 400 for prompt itemType (not in enum)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "p-1", itemType: "prompt" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when itemId is empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ itemId: "", itemType: "agent" }));
    expect(res.status).toBe(400);
  });
});
