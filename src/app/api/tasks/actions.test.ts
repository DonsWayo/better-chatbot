import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, repo } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  repo: {
    createEpic: vi.fn(),
    getEpicById: vi.fn(),
    getEpicWithTasks: vi.fn(),
    listEpicsForUser: vi.fn(),
    updateEpic: vi.fn(),
    deleteEpic: vi.fn(),
    createTask: vi.fn(),
    getTaskById: vi.fn(),
    listTasksForEpic: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    reorderTasks: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ epicRepository: repo }));

const USER = "00000000-0000-0000-0000-00000000aaaa";
const EPIC = "00000000-0000-0000-0000-00000000eeee";
const TASK = "00000000-0000-0000-0000-00000000cccc";

describe("tasks server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: USER } });
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  describe("unauthenticated — all actions return 401-style error", () => {
    beforeEach(() => getSessionMock.mockResolvedValue(null));

    it("createEpicAction → structured Unauthorized", async () => {
      const { createEpicAction } = await import("./actions");
      await expect(
        createEpicAction({ title: "Test" }),
      ).resolves.toEqual({ success: false, error: "Unauthorized" });
      expect(repo.createEpic).not.toHaveBeenCalled();
    });

    it("listEpicsAction → structured Unauthorized", async () => {
      const { listEpicsAction } = await import("./actions");
      await expect(listEpicsAction()).resolves.toEqual({
        success: false,
        error: "Unauthorized",
      });
    });

    it("createTaskAction → structured Unauthorized", async () => {
      const { createTaskAction } = await import("./actions");
      await expect(
        createTaskAction(EPIC, { title: "Task" }),
      ).resolves.toEqual({ success: false, error: "Unauthorized" });
    });
  });

  // -------------------------------------------------------------------------
  // createEpicAction
  // -------------------------------------------------------------------------

  describe("createEpicAction", () => {
    it("creates an epic owned by the caller and returns the row", async () => {
      const fakeEpic = {
        id: EPIC,
        ownerId: USER,
        title: "Ship v2",
        status: "backlog",
      };
      repo.createEpic.mockResolvedValue(fakeEpic);

      const { createEpicAction } = await import("./actions");
      const res = await createEpicAction({ title: "Ship v2" });

      expect(res).toEqual({ success: true, data: fakeEpic });
      expect(repo.createEpic).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: USER, title: "Ship v2" }),
      );
    });

    it("rejects blank title", async () => {
      const { createEpicAction } = await import("./actions");
      const res = await createEpicAction({ title: "   " });
      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /required/i,
      );
      expect(repo.createEpic).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getEpicWithTasksAction
  // -------------------------------------------------------------------------

  describe("getEpicWithTasksAction", () => {
    it("returns epic with tasks for owner", async () => {
      const fakeData = {
        id: EPIC,
        ownerId: USER,
        visibility: "private",
        title: "Ship v2",
        tasks: [{ id: TASK, title: "Write tests", status: "todo" }],
      };
      repo.getEpicWithTasks.mockResolvedValue(fakeData);

      const { getEpicWithTasksAction } = await import("./actions");
      const res = await getEpicWithTasksAction(EPIC);

      expect(res).toEqual({ success: true, data: fakeData });
      expect(repo.getEpicWithTasks).toHaveBeenCalledWith(EPIC);
    });

    it("returns error when epic not found", async () => {
      repo.getEpicWithTasks.mockResolvedValue(null);

      const { getEpicWithTasksAction } = await import("./actions");
      const res = await getEpicWithTasksAction(EPIC);

      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /not found/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateTaskAction — status change
  // -------------------------------------------------------------------------

  describe("updateTaskAction", () => {
    it("updates task status and returns updated row", async () => {
      const fakeTask = {
        id: TASK,
        epicId: EPIC,
        title: "Write tests",
        status: "done",
      };
      repo.updateTask.mockResolvedValue(fakeTask);

      const { updateTaskAction } = await import("./actions");
      const res = await updateTaskAction(TASK, { status: "done" });

      expect(res).toEqual({ success: true, data: fakeTask });
      expect(repo.updateTask).toHaveBeenCalledWith(
        TASK,
        expect.objectContaining({ status: "done" }),
      );
    });

    it("returns error when task not found", async () => {
      repo.updateTask.mockResolvedValue(null);

      const { updateTaskAction } = await import("./actions");
      const res = await updateTaskAction(TASK, { status: "done" });

      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /not found/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // deleteEpicAction — enforces ownership + cascade
  // -------------------------------------------------------------------------

  describe("deleteEpicAction", () => {
    it("deletes epic owned by caller", async () => {
      repo.getEpicById.mockResolvedValue({ id: EPIC, ownerId: USER });
      repo.deleteEpic.mockResolvedValue(undefined);

      const { deleteEpicAction } = await import("./actions");
      const res = await deleteEpicAction(EPIC);

      expect(res).toEqual({ success: true, data: undefined });
      expect(repo.deleteEpic).toHaveBeenCalledWith(EPIC);
    });

    it("denies delete when caller is not owner", async () => {
      repo.getEpicById.mockResolvedValue({
        id: EPIC,
        ownerId: "other-user-id",
      });

      const { deleteEpicAction } = await import("./actions");
      const res = await deleteEpicAction(EPIC);

      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /forbidden/i,
      );
      expect(repo.deleteEpic).not.toHaveBeenCalled();
    });

    it("returns error when epic not found", async () => {
      repo.getEpicById.mockResolvedValue(null);

      const { deleteEpicAction } = await import("./actions");
      const res = await deleteEpicAction(EPIC);

      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /not found/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // createTaskAction
  // -------------------------------------------------------------------------

  describe("createTaskAction", () => {
    it("creates task under epic with caller as createdBy", async () => {
      repo.getEpicById.mockResolvedValue({
        id: EPIC,
        ownerId: USER,
        teamId: null,
      });
      const fakeTask = { id: TASK, epicId: EPIC, title: "Write tests" };
      repo.createTask.mockResolvedValue(fakeTask);

      const { createTaskAction } = await import("./actions");
      const res = await createTaskAction(EPIC, { title: "Write tests" });

      expect(res).toEqual({ success: true, data: fakeTask });
      expect(repo.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          epicId: EPIC,
          title: "Write tests",
          createdBy: USER,
        }),
      );
    });

    it("rejects blank task title", async () => {
      const { createTaskAction } = await import("./actions");
      const res = await createTaskAction(EPIC, { title: "" });
      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /required/i,
      );
    });
  });
});
