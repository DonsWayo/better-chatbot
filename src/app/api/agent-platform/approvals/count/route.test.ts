import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listPendingApprovalsForUserMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listPendingApprovalsForUserMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/agent-platform/approvals", () => ({
  listPendingApprovalsForUser: listPendingApprovalsForUserMock,
}));

describe("GET /api/agent-platform/approvals/count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("never queries approvals when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(listPendingApprovalsForUserMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the {pending: n} shape", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    listPendingApprovalsForUserMock.mockResolvedValueOnce([
      { request: { id: "a" } },
      { request: { id: "b" } },
      { request: { id: "c" } },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ pending: 3 });
  });

  it("passes isAdmin=false for a plain user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    listPendingApprovalsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(listPendingApprovalsForUserMock).toHaveBeenCalledWith("u1", false);
  });

  it("passes isAdmin=true for an admin", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    });
    listPendingApprovalsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(listPendingApprovalsForUserMock).toHaveBeenCalledWith(
      "admin-1",
      true,
    );
  });

  it("returns {pending: 0} when nothing is pending", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    listPendingApprovalsForUserMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ pending: 0 });
  });
});
