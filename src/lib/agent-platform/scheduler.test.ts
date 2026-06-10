import { beforeEach, describe, expect, it, vi } from "vitest";
import { CronError, computeNextRun } from "./cron";

// ── Drizzle mock chain (pattern: src/lib/admin/mcp-servers.test.ts) ───────────

const insertReturningMock = vi.fn();
const insertValuesMock = vi
  .fn()
  .mockReturnValue({ returning: insertReturningMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

const updateReturningMock = vi.fn();
const updateWhereMock = vi.fn();
const updateSetMock = vi.fn();
const updateMock = vi.fn();

const selectLimitMock = vi.fn();
const selectOrderByMock = vi.fn();
const selectWhereMock = vi.fn();
const selectFromMock = vi.fn();
const selectMock = vi.fn();

const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

const executeMock = vi.fn();

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: insertMock,
    update: updateMock,
    select: selectMock,
    delete: deleteMock,
    execute: executeMock,
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  WorkflowScheduleTable: {
    id: "id",
    workflowId: "workflowId",
    createdBy: "createdBy",
    teamId: "teamId",
    createdAt: "createdAt",
    nextRunAt: "nextRunAt",
    enabled: "enabled",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  },
}));

function lastInsertValues(): Record<string, unknown> {
  const call = insertValuesMock.mock.calls.at(-1);
  if (!call) throw new Error("insert .values was never called");
  return call[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertReturningMock.mockImplementation(() =>
    Promise.resolve([lastInsertValues()]),
  );
  insertValuesMock.mockReturnValue({ returning: insertReturningMock });
  insertMock.mockReturnValue({ values: insertValuesMock });

  // update().set(v) → { where } where .where() is both awaitable (thenable
  // resolving to undefined) and has .returning().
  updateReturningMock.mockResolvedValue([{ id: "sched-1" }]);
  updateWhereMock.mockImplementation(() => ({
    returning: updateReturningMock,
    then: (resolve: (v: unknown) => void) => resolve(undefined),
  }));
  updateSetMock.mockReturnValue({ where: updateWhereMock });
  updateMock.mockReturnValue({ set: updateSetMock });

  selectLimitMock.mockResolvedValue([]);
  selectOrderByMock.mockResolvedValue([]);
  selectWhereMock.mockReturnValue({
    limit: selectLimitMock,
    orderBy: selectOrderByMock,
  });
  selectFromMock.mockReturnValue({ where: selectWhereMock });
  selectMock.mockReturnValue({ from: selectFromMock });

  deleteWhereMock.mockResolvedValue(undefined);
  deleteMock.mockReturnValue({ where: deleteWhereMock });

  executeMock.mockResolvedValue({ rows: [] });
});

const BASE_INPUT = {
  workflowId: "wf-1",
  cronExpr: "*/5 * * * *",
  createdBy: "user-1",
};

describe("createSchedule", () => {
  it("throws CronError on an invalid expression and never inserts", async () => {
    const { createSchedule } = await import("./scheduler");
    await expect(
      createSchedule({ ...BASE_INPUT, cronExpr: "61 * * * *" }),
    ).rejects.toThrow(CronError);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("throws CronError on an invalid timezone and never inserts", async () => {
    const { createSchedule } = await import("./scheduler");
    await expect(
      createSchedule({ ...BASE_INPUT, timezone: "Bad/Zone" }),
    ).rejects.toThrow(CronError);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("computes nextRunAt in the future matching computeNextRun", async () => {
    const { createSchedule } = await import("./scheduler");
    const before = new Date();
    await createSchedule(BASE_INPUT);
    const values = lastInsertValues();
    const nextRunAt = values.nextRunAt as Date;
    expect(nextRunAt).toBeInstanceOf(Date);
    expect(nextRunAt.getTime()).toBeGreaterThan(before.getTime());
    // */5 always lands on a 5-minute boundary, within 5 minutes of now.
    expect(nextRunAt.getUTCMinutes() % 5).toBe(0);
    expect(nextRunAt.getTime() - before.getTime()).toBeLessThanOrEqual(
      5 * 60_000,
    );
  });

  it("persists defaults: timezone UTC, enabled true, revisionPin latest", async () => {
    const { createSchedule } = await import("./scheduler");
    await createSchedule(BASE_INPUT);
    const values = lastInsertValues();
    expect(values.timezone).toBe("UTC");
    expect(values.enabled).toBe(true);
    expect(values.revisionPin).toBe("latest");
    expect(values.pinnedRevisionId).toBeNull();
    expect(values.teamId).toBeNull();
  });

  it("persists workflowId, createdBy, teamId, inputTemplate and pin fields", async () => {
    const { createSchedule } = await import("./scheduler");
    await createSchedule({
      ...BASE_INPUT,
      teamId: "team-1",
      inputTemplate: { query: "daily digest" },
      revisionPin: "pinned",
      pinnedRevisionId: "rev-7",
      timezone: "Europe/London",
    });
    const values = lastInsertValues();
    expect(values.workflowId).toBe("wf-1");
    expect(values.createdBy).toBe("user-1");
    expect(values.teamId).toBe("team-1");
    expect(values.inputTemplate).toEqual({ query: "daily digest" });
    expect(values.revisionPin).toBe("pinned");
    expect(values.pinnedRevisionId).toBe("rev-7");
    expect(values.timezone).toBe("Europe/London");
  });
});

describe("updateSchedule / setScheduleEnabled / deleteSchedule", () => {
  it("recomputes nextRunAt when cronExpr changes", async () => {
    selectLimitMock.mockResolvedValue([
      { id: "sched-1", cronExpr: "*/5 * * * *", timezone: "UTC" },
    ]);
    const { updateSchedule } = await import("./scheduler");
    await updateSchedule("sched-1", { cronExpr: "0 9 * * 1" });
    const set = updateSetMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(set.cronExpr).toBe("0 9 * * 1");
    const nextRunAt = set.nextRunAt as Date;
    expect(nextRunAt).toBeInstanceOf(Date);
    expect(nextRunAt.getUTCDay()).toBe(1); // a Monday
    expect(nextRunAt.getUTCHours()).toBe(9);
  });

  it("rejects an invalid cronExpr patch without touching the db", async () => {
    const { updateSchedule } = await import("./scheduler");
    await expect(
      updateSchedule("sched-1", { cronExpr: "nope" }),
    ).rejects.toThrow(CronError);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns null when recompute is needed but the schedule does not exist", async () => {
    selectLimitMock.mockResolvedValue([]);
    const { updateSchedule } = await import("./scheduler");
    const result = await updateSchedule("missing", { cronExpr: "0 9 * * 1" });
    expect(result).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("setScheduleEnabled(false) disables without recomputing nextRunAt", async () => {
    const { setScheduleEnabled } = await import("./scheduler");
    await setScheduleEnabled("sched-1", false);
    const set = updateSetMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(set.enabled).toBe(false);
    expect(set.nextRunAt).toBeUndefined();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("setScheduleEnabled(true) recomputes nextRunAt from now", async () => {
    selectLimitMock.mockResolvedValue([
      { id: "sched-1", cronExpr: "*/5 * * * *", timezone: "UTC" },
    ]);
    const { setScheduleEnabled } = await import("./scheduler");
    const before = Date.now();
    await setScheduleEnabled("sched-1", true);
    const set = updateSetMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(set.enabled).toBe(true);
    expect((set.nextRunAt as Date).getTime()).toBeGreaterThan(before);
  });

  it("deleteSchedule issues a delete", async () => {
    const { deleteSchedule } = await import("./scheduler");
    await deleteSchedule("sched-1");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});

describe("claimDueSchedules", () => {
  const RAW_ROW = {
    id: "sched-1",
    workflow_id: "wf-1",
    revision_pin: "latest",
    pinned_revision_id: null,
    cron_expr: "*/5 * * * *",
    timezone: "UTC",
    enabled: true,
    input_template: { query: "hi" },
    team_id: "team-1",
    created_by: "user-1",
    last_run_at: new Date("2026-06-10T11:55:00Z"),
    next_run_at: new Date("2026-06-10T12:00:00Z"),
    created_at: new Date("2026-06-01T00:00:00Z"),
    updated_at: new Date("2026-06-10T11:55:00Z"),
  };

  it("returns [] without executing when limit <= 0", async () => {
    const { claimDueSchedules } = await import("./scheduler");
    expect(await claimDueSchedules(0)).toEqual([]);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("maps claimed snake_case rows to camelCase entities", async () => {
    executeMock.mockResolvedValue({ rows: [RAW_ROW] });
    const { claimDueSchedules } = await import("./scheduler");
    const [claimed] = await claimDueSchedules(5);
    expect(claimed.workflowId).toBe("wf-1");
    expect(claimed.cronExpr).toBe("*/5 * * * *");
    expect(claimed.createdBy).toBe("user-1");
    expect(claimed.teamId).toBe("team-1");
    expect(claimed.inputTemplate).toEqual({ query: "hi" });
  });

  it("advances next_run_at on claim to computeNextRun(now)", async () => {
    executeMock.mockResolvedValue({ rows: [RAW_ROW] });
    const { claimDueSchedules } = await import("./scheduler");
    const before = new Date();
    const [claimed] = await claimDueSchedules(5);
    const set = updateSetMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const nextRunAt = set.nextRunAt as Date;
    expect(nextRunAt).toBeInstanceOf(Date);
    expect(nextRunAt.getTime()).toBeGreaterThan(before.getTime());
    // exact cron semantics: a */5 boundary within 5 minutes of the claim
    // moment (computed with the schedule's own cronExpr/timezone).
    expect(nextRunAt.getUTCMinutes() % 5).toBe(0);
    expect(nextRunAt.getUTCSeconds()).toBe(0);
    expect(nextRunAt.getTime() - before.getTime()).toBeLessThanOrEqual(
      5 * 60_000,
    );
    expect(nextRunAt.getTime()).toBeGreaterThanOrEqual(
      computeNextRun("*/5 * * * *", before, "UTC").getTime(),
    );
    expect(claimed.nextRunAt?.getTime()).toBe(nextRunAt.getTime());
  });

  it("advances next_run_at once per claimed row", async () => {
    executeMock.mockResolvedValue({
      rows: [RAW_ROW, { ...RAW_ROW, id: "sched-2", cron_expr: "0 9 * * 1" }],
    });
    const { claimDueSchedules } = await import("./scheduler");
    const claimed = await claimDueSchedules(5);
    expect(claimed).toHaveLength(2);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it("disables a claimed schedule whose cron can no longer be computed", async () => {
    executeMock.mockResolvedValue({
      rows: [{ ...RAW_ROW, cron_expr: "0 0 31 2 *" }], // never fires
    });
    const { claimDueSchedules } = await import("./scheduler");
    const [claimed] = await claimDueSchedules(5);
    const set = updateSetMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(set.enabled).toBe(false);
    expect(set.nextRunAt).toBeNull();
    expect(claimed.enabled).toBe(false);
  });

  it("returns [] when no rows are due", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const { claimDueSchedules } = await import("./scheduler");
    expect(await claimDueSchedules(5)).toEqual([]);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("listSchedulesForUser / listSchedulesForTeam", () => {
  it("lists by creator ordered by createdAt desc", async () => {
    selectOrderByMock.mockResolvedValue([{ id: "sched-1" }]);
    const { listSchedulesForUser } = await import("./scheduler");
    const rows = await listSchedulesForUser("user-1");
    expect(rows).toEqual([{ id: "sched-1" }]);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("lists by team", async () => {
    selectOrderByMock.mockResolvedValue([{ id: "sched-2" }]);
    const { listSchedulesForTeam } = await import("./scheduler");
    const rows = await listSchedulesForTeam("team-1");
    expect(rows).toEqual([{ id: "sched-2" }]);
  });
});
