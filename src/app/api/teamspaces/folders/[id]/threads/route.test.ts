import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listThreadsInFolderMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  listThreadsInFolderMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/teamspaces/folders", () => ({
  listThreadsInFolder: listThreadsInFolderMock,
}));

const request = {} as Request;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/teamspaces/folders/[id]/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(request, params("f1"));
    expect(res.status).toBe(401);
    expect(listThreadsInFolderMock).not.toHaveBeenCalled();
  });

  it("returns the visible threads for a member", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listThreadsInFolderMock.mockResolvedValue([
      { id: "t1", title: "Hello", userId: "u2", visibility: "team" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(request, params("f1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(listThreadsInFolderMock).toHaveBeenCalledWith("f1", "u1");
  });

  it("returns 404 when the folder does not exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listThreadsInFolderMock.mockRejectedValue(new Error("Folder not found"));
    const { GET } = await import("./route");
    const res = await GET(request, params("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    listThreadsInFolderMock.mockRejectedValue(
      new Error("You do not have access to this folder"),
    );
    const { GET } = await import("./route");
    const res = await GET(request, params("f1"));
    expect(res.status).toBe(403);
  });
});
