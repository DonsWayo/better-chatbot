import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listSessionsForUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listSessionsForUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/agent-platform/sessions", () => ({
  listSessionsForUser: listSessionsForUserMock,
}));

describe("GET /api/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("never calls listSessionsForUser when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(listSessionsForUserMock).not.toHaveBeenCalled();
  });

  it("returns 200 for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("calls listSessionsForUser with the session userId and limit 30", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc-999" } });
    listSessionsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(listSessionsForUserMock).toHaveBeenCalledWith("user-abc-999", {
      limit: 30,
    });
  });

  it("returns the sessions as a JSON array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const SESSIONS = [
      { id: "s-1", status: "running" },
      { id: "s-2", status: "completed" },
    ];
    listSessionsForUserMock.mockResolvedValueOnce(SESSIONS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("s-1");
  });

  it("200 response has JSON content-type", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("calls listSessionsForUser exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listSessionsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(listSessionsForUserMock).toHaveBeenCalledTimes(1);
  });
});
