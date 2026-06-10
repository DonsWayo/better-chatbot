import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    const THREADS = [
      { id: "t-1", title: "My chat" },
      { id: "t-2", title: "Another" },
    ];
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
    const THREADS = Array.from({ length: 10 }, (_, i) => ({
      id: `t-${i}`,
      title: `Thread ${i}`,
    }));
    selectThreadsByUserIdMock.mockResolvedValueOnce(THREADS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(10);
  });

  it("200 response body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("calls selectThreadsByUserId exactly once", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).toHaveBeenCalledTimes(1);
  });

  it("401 response body is text (not JSON)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });
});

describe("GET /api/thread — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("repository called with the session user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "uid-42" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).toHaveBeenCalledWith("uid-42");
  });

  it("200 response is JSON array even for different users", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "uid-99" } });
    const threads = [{ id: "t-99", title: "Test" }];
    selectThreadsByUserIdMock.mockResolvedValueOnce(threads);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].id).toBe("t-99");
  });

  it("never calls repository more than once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/thread — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("selectThreadsByUserId called with correct userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "specific-user" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).toHaveBeenCalledWith("specific-user");
  });
});

describe("GET /api/thread — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("GET returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("selectThreadsByUserId not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).not.toHaveBeenCalled();
  });

  it("selectThreadsByUserId called exactly once for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadsByUserIdMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectThreadsByUserIdMock).toHaveBeenCalledTimes(1);
  });
});
