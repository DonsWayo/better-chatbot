import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listFoldersForUserMock, listUserTeamsMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    listFoldersForUserMock: vi.fn(),
    listUserTeamsMock: vi.fn(),
  }));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/teamspaces/folders", () => ({
  listFoldersForUser: listFoldersForUserMock,
  listUserTeams: listUserTeamsMock,
}));

describe("GET /api/teamspaces/folders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listFoldersForUserMock).not.toHaveBeenCalled();
  });

  it("returns userId, folders and teams for the caller", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listFoldersForUserMock.mockResolvedValue([
      { id: "f1", name: "Mine", parentId: null, teamId: null },
    ]);
    listUserTeamsMock.mockResolvedValue([
      { id: "t1", name: "Platform", role: "member" },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("u1");
    expect(body.folders).toHaveLength(1);
    expect(body.teams[0]).toEqual({
      id: "t1",
      name: "Platform",
      role: "member",
    });
  });

  it("scopes both queries to the session user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz" } });
    listFoldersForUserMock.mockResolvedValue([]);
    listUserTeamsMock.mockResolvedValue([]);
    const { GET } = await import("./route");
    await GET();
    expect(listFoldersForUserMock).toHaveBeenCalledWith("user-xyz");
    expect(listUserTeamsMock).toHaveBeenCalledWith("user-xyz");
  });
});
