import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, selectThreadsByUserIdMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectThreadsByUserIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectThreadsByUserId: selectThreadsByUserIdMock,
  },
}));

describe("GET /api/thread", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("never calls repository when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).not.toHaveBeenCalled();
  });

  it("returns 200 for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns empty array when user has no threads", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns threads for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const THREADS = [{ id: "t-1", title: "My chat" }, { id: "t-2", title: "Another" }];
    selectThreadsByUserIdMock.mockResolvedValueOnce(THREADS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("t-1");
  });

  it("passes correct userId to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc-999" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).toHaveBeenCalledWith("user-abc-999");
  });

  it("preserves thread fields in response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const thread = { id: "t-1", title: "My chat", createdAt: "2025-01-01" };
    selectThreadsByUserIdMock.mockResolvedValueOnce([thread]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].id).toBe("t-1");
    expect(body[0].title).toBe("My chat");
    expect(body[0].createdAt).toBe("2025-01-01");
  });

  it("returns many threads correctly", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const THREADS = Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, title: `Thread ${i}` }));
    selectThreadsByUserIdMock.mockResolvedValueOnce(THREADS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(10);
  });
});
