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

  it("returns empty array when user has no threads", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns threads for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const THREADS = [{ id: "t-1", title: "My chat" }, { id: "t-2", title: "Another" }];
    selectThreadsByUserIdMock.mockResolvedValueOnce(THREADS);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("t-1");
  });
});
