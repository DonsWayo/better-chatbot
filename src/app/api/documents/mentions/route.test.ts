import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUnreadMock: vi.fn(),
  markReadMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mentionNotificationRepository: {
    getUnreadForUser: h.getUnreadMock,
    markRead: h.markReadMock,
  },
}));

import { GET, PATCH } from "./route";

const USER = "user-1";
const MENTION = {
  id: "m-1",
  recipientId: USER,
  authorId: "author-1",
  authorName: "Alice",
  documentId: "doc-1",
  documentTitle: "My Doc",
  commentId: "c-1",
  isRead: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getSessionMock.mockResolvedValue({ user: { id: USER } });
});

describe("GET /api/documents/mentions", () => {
  it("returns unread mentions with ISO dates", async () => {
    h.getUnreadMock.mockResolvedValue([MENTION]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mentions).toHaveLength(1);
    expect(body.mentions[0].id).toBe("m-1");
    expect(typeof body.mentions[0].createdAt).toBe("string");
  });

  it("returns empty array when no unread mentions", async () => {
    h.getUnreadMock.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.mentions).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/documents/mentions", () => {
  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/documents/mentions", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("marks the provided ids as read", async () => {
    h.markReadMock.mockResolvedValue(undefined);
    const res = await PATCH(makeRequest({ ids: ["m-1", "m-2"] }));
    expect(res.status).toBe(200);
    expect(h.markReadMock).toHaveBeenCalledWith(USER, ["m-1", "m-2"]);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 when ids is not an array", async () => {
    const res = await PATCH(makeRequest({ ids: "not-an-array" }));
    expect(res.status).toBe(400);
    expect(h.markReadMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ ids: [] }));
    expect(res.status).toBe(401);
  });
});
