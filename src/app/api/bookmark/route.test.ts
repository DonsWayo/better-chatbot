import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, bookmarkRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  bookmarkRepositoryMock: {
    checkItemAccess: vi.fn(),
    createBookmark: vi.fn(),
    removeBookmark: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  bookmarkRepository: bookmarkRepositoryMock,
}));

import { POST, DELETE } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/bookmark", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when user id is missing", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (missing itemId)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({ itemType: "agent" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid itemType", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when item not accessible", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    bookmarkRepositoryMock.checkItemAccess.mockResolvedValue(false);
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(404);
  });

  it("creates bookmark and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    bookmarkRepositoryMock.checkItemAccess.mockResolvedValue(true);
    bookmarkRepositoryMock.createBookmark.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls checkItemAccess with correct args", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    bookmarkRepositoryMock.checkItemAccess.mockResolvedValue(true);
    bookmarkRepositoryMock.createBookmark.mockResolvedValue(undefined);
    await POST(makeRequest({ itemId: "wf-1", itemType: "workflow" }));
    expect(bookmarkRepositoryMock.checkItemAccess).toHaveBeenCalledWith(
      "wf-1",
      "workflow",
      "user-99",
    );
  });

  it("calls createBookmark with correct args", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    bookmarkRepositoryMock.checkItemAccess.mockResolvedValue(true);
    bookmarkRepositoryMock.createBookmark.mockResolvedValue(undefined);
    await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(bookmarkRepositoryMock.createBookmark).toHaveBeenCalledWith(
      "user-1",
      "a-1",
      "agent",
    );
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    bookmarkRepositoryMock.checkItemAccess.mockRejectedValue(new Error("DB fail"));
    const res = await POST(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/bookmark", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await DELETE(makeRequest({ itemId: "", itemType: "agent" }));
    expect(res.status).toBe(400);
  });

  it("removes bookmark and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    bookmarkRepositoryMock.removeBookmark.mockResolvedValue(undefined);
    const res = await DELETE(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls removeBookmark with correct args", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    bookmarkRepositoryMock.removeBookmark.mockResolvedValue(undefined);
    await DELETE(makeRequest({ itemId: "wf-5", itemType: "workflow" }));
    expect(bookmarkRepositoryMock.removeBookmark).toHaveBeenCalledWith(
      "user-42",
      "wf-5",
      "workflow",
    );
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    bookmarkRepositoryMock.removeBookmark.mockRejectedValue(new Error("DB fail"));
    const res = await DELETE(makeRequest({ itemId: "a-1", itemType: "agent" }));
    expect(res.status).toBe(500);
  });
});
