import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, repo } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  repo: {
    createEpic: vi.fn(),
    getEpicById: vi.fn(),
    getEpicWithTasks: vi.fn(),
    canUserReadEpic: vi.fn(),
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
      const fakeEpic = {
        id: EPIC,
        ownerId: USER,
        visibility: "private",
        title: "Ship v2",
      };
      const fakeTasks = [{ id: TASK, title: "Write tests", status: "todo" }];
      repo.getEpicById.mockResolvedValue(fakeEpic);
      repo.canUserReadEpic.mockResolvedValue(true);
      repo.listTasksForEpic.mockResolvedValue(fakeTasks);

      const { getEpicWithTasksAction } = await import("./actions");
      const res = await getEpicWithTasksAction(EPIC);

      expect(res).toEqual({
        success: true,
        data: { ...fakeEpic, tasks: fakeTasks },
      });
      expect(repo.getEpicById).toHaveBeenCalledWith(EPIC);
      expect(repo.canUserReadEpic).toHaveBeenCalledWith(fakeEpic, USER);
      expect(repo.listTasksForEpic).toHaveBeenCalledWith(EPIC);
    });

    it("returns Forbidden when visibility check fails", async () => {
      repo.getEpicById.mockResolvedValue({
        id: EPIC,
        ownerId: "other-user",
        visibility: "private",
      });
      repo.canUserReadEpic.mockResolvedValue(false);

      const { getEpicWithTasksAction } = await import("./actions");
      const res = await getEpicWithTasksAction(EPIC);

      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /forbidden/i,
      );
    });

    it("returns error when epic not found", async () => {
      repo.getEpicById.mockResolvedValue(null);

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
      const existingTask = { id: TASK, epicId: EPIC, title: "Write tests", status: "todo" };
      const updatedTask = { ...existingTask, status: "done" };
      repo.getTaskById.mockResolvedValue(existingTask);
      repo.getEpicById.mockResolvedValue({ id: EPIC, ownerId: USER });
      repo.updateTask.mockResolvedValue(updatedTask);

      const { updateTaskAction } = await import("./actions");
      const res = await updateTaskAction(TASK, { status: "done" });

      expect(res).toEqual({ success: true, data: updatedTask });
      expect(repo.getTaskById).toHaveBeenCalledWith(TASK);
      expect(repo.getEpicById).toHaveBeenCalledWith(EPIC);
      expect(repo.updateTask).toHaveBeenCalledWith(
        TASK,
        expect.objectContaining({ status: "done" }),
      );
    });

    it("returns Forbidden when caller does not own the epic", async () => {
      repo.getTaskById.mockResolvedValue({ id: TASK, epicId: EPIC });
      repo.getEpicById.mockResolvedValue({ id: EPIC, ownerId: "other-user" });

      const { updateTaskAction } = await import("./actions");
      const res = await updateTaskAction(TASK, { status: "done" });

      expect(res.success).toBe(false);
      expect((res as { success: false; error: string }).error).toMatch(
        /forbidden/i,
      );
      expect(repo.updateTask).not.toHaveBeenCalled();
    });

    it("returns error when task not found", async () => {
      repo.getTaskById.mockResolvedValue(null);

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
