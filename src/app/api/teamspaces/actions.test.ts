import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  createFolderMock,
  renameFolderMock,
  deleteFolderMock,
  moveThreadToFolderMock,
  setThreadVisibilityMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  createFolderMock: vi.fn(),
  renameFolderMock: vi.fn(),
  deleteFolderMock: vi.fn(),
  moveThreadToFolderMock: vi.fn(),
  setThreadVisibilityMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/teamspaces/folders", () => ({
  createFolder: createFolderMock,
  renameFolder: renameFolderMock,
  deleteFolder: deleteFolderMock,
  moveThreadToFolder: moveThreadToFolderMock,
  setThreadVisibility: setThreadVisibilityMock,
}));

describe("teamspaces server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unauthenticated", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(null);
    });

    it("createFolderAction throws Unauthorized", async () => {
      const { createFolderAction } = await import("./actions");
      await expect(createFolderAction({ name: "X" })).rejects.toThrow(
        "Unauthorized",
      );
      expect(createFolderMock).not.toHaveBeenCalled();
    });

    it("renameFolderAction throws Unauthorized", async () => {
      const { renameFolderAction } = await import("./actions");
      await expect(renameFolderAction("f1", "X")).rejects.toThrow(
        "Unauthorized",
      );
    });

    it("deleteFolderAction throws Unauthorized", async () => {
      const { deleteFolderAction } = await import("./actions");
      await expect(deleteFolderAction("f1")).rejects.toThrow("Unauthorized");
    });

    it("moveThreadToFolderAction throws Unauthorized", async () => {
      const { moveThreadToFolderAction } = await import("./actions");
      await expect(moveThreadToFolderAction("t1", "f1")).rejects.toThrow(
        "Unauthorized",
      );
    });

    it("setThreadVisibilityAction throws Unauthorized", async () => {
      const { setThreadVisibilityAction } = await import("./actions");
      await expect(setThreadVisibilityAction("t1", "team")).rejects.toThrow(
        "Unauthorized",
      );
    });
  });

  describe("authenticated", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("createFolderAction forwards the caller as owner", async () => {
      createFolderMock.mockResolvedValue({ id: "f1" });
      const { createFolderAction } = await import("./actions");
      const result = await createFolderAction({ name: "Docs", teamId: "t1" });
      expect(result).toEqual({ id: "f1" });
      expect(createFolderMock).toHaveBeenCalledWith({
        name: "Docs",
        teamId: "t1",
        parentId: null,
        userId: "u1",
      });
    });

    it("moveThreadToFolderAction forwards the session user", async () => {
      const { moveThreadToFolderAction } = await import("./actions");
      await moveThreadToFolderAction("t1", null);
      expect(moveThreadToFolderMock).toHaveBeenCalledWith("t1", null, "u1");
    });

    it("setThreadVisibilityAction forwards the session user", async () => {
      const { setThreadVisibilityAction } = await import("./actions");
      await setThreadVisibilityAction("t1", "team");
      expect(setThreadVisibilityMock).toHaveBeenCalledWith("t1", "team", "u1");
    });

    it("rename and delete forward the session user", async () => {
      renameFolderMock.mockResolvedValue({ id: "f1", name: "Y" });
      const { renameFolderAction, deleteFolderAction } = await import(
        "./actions"
      );
      await renameFolderAction("f1", "Y");
      expect(renameFolderMock).toHaveBeenCalledWith("f1", "Y", "u1");
      await deleteFolderAction("f1");
      expect(deleteFolderMock).toHaveBeenCalledWith("f1", "u1");
    });
  });
});
