import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, chatRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatRepositoryMock: {
    selectThreadsByUserId: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ chatRepository: chatRepositoryMock }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/thread", () => {
  it("returns 401 when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when user id is missing", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with threads for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.selectThreadsByUserId.mockResolvedValue([
      { id: "t-1", title: "Thread 1" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("t-1");
  });

  it("calls repository with the user id from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    chatRepositoryMock.selectThreadsByUserId.mockResolvedValue([]);
    await GET();
    expect(chatRepositoryMock.selectThreadsByUserId).toHaveBeenCalledWith("user-42");
  });

  it("returns empty array when no threads", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.selectThreadsByUserId.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
