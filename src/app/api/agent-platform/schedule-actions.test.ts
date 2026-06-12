import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getUserPrimaryTeamIdMock,
  getTeamWithMembersMock,
  createScheduleMock,
  deleteScheduleMock,
  listSchedulesForUserMock,
  setScheduleEnabledMock,
  estimateCostUsdMock,
  checkAccessMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserPrimaryTeamIdMock: vi.fn(),
  getTeamWithMembersMock: vi.fn(),
  createScheduleMock: vi.fn(),
  deleteScheduleMock: vi.fn(),
  listSchedulesForUserMock: vi.fn(),
  setScheduleEnabledMock: vi.fn(),
  estimateCostUsdMock: vi.fn(),
  checkAccessMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
  getTeamWithMembers: getTeamWithMembersMock,
}));
vi.mock("lib/agent-platform/scheduler", () => ({
  createSchedule: createScheduleMock,
  deleteSchedule: deleteScheduleMock,
  listSchedulesForUser: listSchedulesForUserMock,
  setScheduleEnabled: setScheduleEnabledMock,
}));
vi.mock("lib/ai/budget", () => ({ estimateCostUsd: estimateCostUsdMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { checkAccess: checkAccessMock },
}));

const USER = { user: { id: "u-1", role: "user" } };
const SCHEDULE = {
  id: "sched-1",
  workflowId: "wf-1",
  cronExpr: "0 9 * * *",
  timezone: "Europe/London",
  enabled: true,
  createdBy: "u-1",
};

describe("createScheduleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    createScheduleMock.mockResolvedValue(SCHEDULE);
    checkAccessMock.mockResolvedValue(true);
  });

  it("throws Unauthorized when unauthenticated and never creates", async () => {
    getSessionMock.mockResolvedValue(null);
    const { createScheduleAction } = await import("./schedule-actions");
    await expect(
      createScheduleAction({ workflowId: "wf-1", cronExpr: "0 9 * * *" }),
    ).rejects.toThrow("Unauthorized");
    expect(createScheduleMock).not.toHaveBeenCalled();
  });

  it("rejects (and never creates) a workflow the caller cannot access (IDOR fix)", async () => {
    getSessionMock.mockResolvedValue(USER);
    checkAccessMock.mockResolvedValueOnce(false);
    const { createScheduleAction } = await import("./schedule-actions");
    await expect(
      createScheduleAction({ workflowId: "wf-not-mine", cronExpr: "0 9 * * *" }),
    ).rejects.toThrow(/access/i);
    expect(checkAccessMock).toHaveBeenCalledWith("wf-not-mine", "u-1", true);
    expect(createScheduleMock).not.toHaveBeenCalled();
  });

  it("creates with the caller's userId and primary teamId", async () => {
    getSessionMock.mockResolvedValue(USER);
    const { createScheduleAction } = await import("./schedule-actions");
    await createScheduleAction({ workflowId: "wf-1", cronExpr: "0 9 * * *" });
    expect(getUserPrimaryTeamIdMock).toHaveBeenCalledWith("u-1");
    expect(createScheduleMock).toHaveBeenCalledWith({
      workflowId: "wf-1",
      cronExpr: "0 9 * * *",
      timezone: "Europe/London",
      teamId: "team-1",
      createdBy: "u-1",
    });
  });

  it("defaults the timezone to Europe/London", async () => {
    getSessionMock.mockResolvedValue(USER);
    const { createScheduleAction } = await import("./schedule-actions");
    await createScheduleAction({ workflowId: "wf-1", cronExpr: "0 * * * *" });
    expect(createScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Europe/London" }),
    );
  });

  it("honors an explicit timezone", async () => {
    getSessionMock.mockResolvedValue(USER);
    const { createScheduleAction } = await import("./schedule-actions");
    await createScheduleAction({
      workflowId: "wf-1",
      cronExpr: "0 * * * *",
      timezone: "Asia/Tokyo",
    });
    expect(createScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Tokyo" }),
    );
  });

  it("parks the routine when enabled=false", async () => {
    getSessionMock.mockResolvedValue(USER);
    setScheduleEnabledMock.mockResolvedValue({ ...SCHEDULE, enabled: false });
    const { createScheduleAction } = await import("./schedule-actions");
    const result = await createScheduleAction({
      workflowId: "wf-1",
      cronExpr: "0 9 * * *",
      enabled: false,
    });
    expect(setScheduleEnabledMock).toHaveBeenCalledWith("sched-1", false);
    expect(result.enabled).toBe(false);
  });

  it("does not touch enabled state by default", async () => {
    getSessionMock.mockResolvedValue(USER);
    const { createScheduleAction } = await import("./schedule-actions");
    await createScheduleAction({ workflowId: "wf-1", cronExpr: "0 9 * * *" });
    expect(setScheduleEnabledMock).not.toHaveBeenCalled();
  });

  it("propagates CronError from the scheduler (dialog validation path)", async () => {
    getSessionMock.mockResolvedValue(USER);
    createScheduleMock.mockRejectedValueOnce(
      new Error("Invalid cron expression"),
    );
    const { createScheduleAction } = await import("./schedule-actions");
    await expect(
      createScheduleAction({ workflowId: "wf-1", cronExpr: "not-a-cron" }),
    ).rejects.toThrow("Invalid cron expression");
  });
});

describe("toggleScheduleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { toggleScheduleAction } = await import("./schedule-actions");
    await expect(toggleScheduleAction("sched-1", false)).rejects.toThrow(
      "Unauthorized",
    );
    expect(setScheduleEnabledMock).not.toHaveBeenCalled();
  });

  it("rejects a schedule the caller does not own and never toggles", async () => {
    getSessionMock.mockResolvedValue(USER);
    // The caller's own list does not contain the target id.
    listSchedulesForUserMock.mockResolvedValueOnce([
      { ...SCHEDULE, id: "someone-elses" },
    ]);
    const { toggleScheduleAction } = await import("./schedule-actions");
    await expect(toggleScheduleAction("sched-1", false)).rejects.toThrow(
      "Schedule not found",
    );
    expect(listSchedulesForUserMock).toHaveBeenCalledWith("u-1");
    expect(setScheduleEnabledMock).not.toHaveBeenCalled();
  });

  it("toggles an owned schedule", async () => {
    getSessionMock.mockResolvedValue(USER);
    listSchedulesForUserMock.mockResolvedValueOnce([SCHEDULE]);
    setScheduleEnabledMock.mockResolvedValueOnce({
      ...SCHEDULE,
      enabled: false,
    });
    const { toggleScheduleAction } = await import("./schedule-actions");
    const result = await toggleScheduleAction("sched-1", false);
    expect(setScheduleEnabledMock).toHaveBeenCalledWith("sched-1", false);
    expect(result?.enabled).toBe(false);
  });
});

describe("deleteScheduleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws Unauthorized when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteScheduleAction } = await import("./schedule-actions");
    await expect(deleteScheduleAction("sched-1")).rejects.toThrow(
      "Unauthorized",
    );
    expect(deleteScheduleMock).not.toHaveBeenCalled();
  });

  it("rejects deleting a schedule the caller does not own", async () => {
    getSessionMock.mockResolvedValue(USER);
    listSchedulesForUserMock.mockResolvedValueOnce([]);
    const { deleteScheduleAction } = await import("./schedule-actions");
    await expect(deleteScheduleAction("sched-1")).rejects.toThrow(
      "Schedule not found",
    );
    expect(deleteScheduleMock).not.toHaveBeenCalled();
  });

  it("deletes an owned schedule", async () => {
    getSessionMock.mockResolvedValue(USER);
    listSchedulesForUserMock.mockResolvedValueOnce([SCHEDULE]);
    const { deleteScheduleAction } = await import("./schedule-actions");
    await deleteScheduleAction("sched-1");
    expect(deleteScheduleMock).toHaveBeenCalledWith("sched-1");
  });
});

describe("estimateRoutineCostAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimateCostUsdMock.mockReturnValue(0.0035);
  });

  it("throws Unauthorized when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { estimateRoutineCostAction } = await import("./schedule-actions");
    await expect(estimateRoutineCostAction()).rejects.toThrow("Unauthorized");
  });

  it("prices a nominal 2k-token run and labels the team budget", async () => {
    getSessionMock.mockResolvedValue(USER);
    getUserPrimaryTeamIdMock.mockResolvedValueOnce("team-1");
    getTeamWithMembersMock.mockResolvedValueOnce({ name: "Design" });
    const { estimateRoutineCostAction } = await import("./schedule-actions");
    const result = await estimateRoutineCostAction();
    expect(estimateCostUsdMock).toHaveBeenCalledWith("default", 1500, 500);
    expect(result).toEqual({ estimatedUsd: 0.0035, budgetLabel: "Design" });
  });

  it("returns a null budgetLabel when the user has no primary team", async () => {
    getSessionMock.mockResolvedValue(USER);
    getUserPrimaryTeamIdMock.mockResolvedValueOnce(null);
    const { estimateRoutineCostAction } = await import("./schedule-actions");
    const result = await estimateRoutineCostAction();
    expect(result.budgetLabel).toBeNull();
    expect(getTeamWithMembersMock).not.toHaveBeenCalled();
  });

  it("degrades to a null budgetLabel when the team lookup fails", async () => {
    getSessionMock.mockResolvedValue(USER);
    getUserPrimaryTeamIdMock.mockResolvedValueOnce("team-1");
    getTeamWithMembersMock.mockRejectedValueOnce(new Error("db down"));
    const { estimateRoutineCostAction } = await import("./schedule-actions");
    const result = await estimateRoutineCostAction();
    expect(result).toEqual({ estimatedUsd: 0.0035, budgetLabel: null });
  });
});
