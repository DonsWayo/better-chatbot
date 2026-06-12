import type {
  AgentSessionEntity,
  WorkflowScheduleEntity,
} from "lib/db/pg/schema.pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TickResult } from "./worker";

// ── mocks ──────────────────────────────────────────────────────────────────────

const { executeMock, updateMock, updateSetMock, updateWhereMock } = vi.hoisted(
  () => {
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    return {
      executeMock: vi.fn(),
      updateSetMock,
      updateWhereMock,
      updateMock: vi.fn().mockReturnValue({ set: updateSetMock }),
    };
  },
);

const {
  claimDueSchedulesMock,
  createSessionMock,
  failSessionMock,
  attachMock,
  detachMock,
  selectStructureByIdMock,
  checkAccessMock,
  createExecutorMock,
  executorRunMock,
  isKillSwitchActiveMock,
  checkBudgetMock,
  resolveAllowListMock,
} = vi.hoisted(() => ({
  claimDueSchedulesMock: vi.fn(),
  createSessionMock: vi.fn(),
  failSessionMock: vi.fn(),
  attachMock: vi.fn(),
  detachMock: vi.fn(),
  selectStructureByIdMock: vi.fn(),
  checkAccessMock: vi.fn(),
  createExecutorMock: vi.fn(),
  executorRunMock: vi.fn(),
  isKillSwitchActiveMock: vi.fn(),
  checkBudgetMock: vi.fn(),
  resolveAllowListMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { execute: executeMock, update: updateMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AgentSessionTable: { id: "id", status: "status" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => ({})) },
  ),
}));
vi.mock("./scheduler", () => ({
  claimDueSchedules: claimDueSchedulesMock,
}));
vi.mock("./sessions", () => ({
  createSession: createSessionMock,
  failSession: failSessionMock,
}));
vi.mock("./persistent-executor", () => ({
  attachSessionPersistence: attachMock,
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectStructureById: selectStructureByIdMock,
    checkAccess: checkAccessMock,
  },
}));
vi.mock("lib/ai/budget", () => ({
  checkBudget: checkBudgetMock,
}));
vi.mock("lib/admin/teams", () => ({
  getTeamPolicy: vi.fn().mockResolvedValue({ guardrailPolicy: "standard" }),
  getUserPrimaryTeamId: vi.fn().mockResolvedValue("team-1"),
}));
vi.mock("lib/admin/effective-models", () => ({
  resolveEffectiveModelAllowList: resolveAllowListMock,
}));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: createExecutorMock,
}));
vi.mock("lib/observability/kill-switch", () => ({
  isKillSwitchActive: isKillSwitchActiveMock,
}));
vi.mock("lib/utils", () => ({
  toAny: (v: unknown) => v,
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));

// ── fixtures ───────────────────────────────────────────────────────────────────

const SCHEDULE = {
  id: "sched-1",
  workflowId: "wf-1",
  revisionPin: "latest",
  pinnedRevisionId: null,
  cronExpr: "*/5 * * * *",
  timezone: "UTC",
  enabled: true,
  inputTemplate: { query: "daily" },
  teamId: "team-1",
  createdBy: "user-1",
  lastRunAt: null,
  nextRunAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as WorkflowScheduleEntity;

const SESSION = {
  id: "sess-1",
  kind: "workflow",
  definitionId: "wf-1",
  status: "running",
  userId: "user-1",
  inputPayload: { query: "daily" },
} as unknown as AgentSessionEntity;

/** Raw snake_case row as the SKIP LOCKED claim returns it. */
const RAW_SESSION_ROW = {
  id: "sess-1",
  kind: "workflow",
  definition_id: "wf-1",
  revision_id: null,
  team_id: "team-1",
  user_id: "user-1",
  folder_id: null,
  origin_surface: "schedule",
  mode: "autopilot",
  status: "running",
  cost_so_far: 0,
  input_payload: { query: "daily" },
  error: null,
  parent_session_id: null,
  heartbeat_at: new Date(),
  started_at: new Date(),
  ended_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const WORKFLOW_STRUCTURE = { name: "wf", nodes: [], edges: [] };

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockResolvedValue({ rows: [] });
  updateWhereMock.mockResolvedValue(undefined);
  updateSetMock.mockReturnValue({ where: updateWhereMock });
  updateMock.mockReturnValue({ set: updateSetMock });

  claimDueSchedulesMock.mockResolvedValue([]);
  createSessionMock.mockResolvedValue({ id: "sess-1" });
  failSessionMock.mockResolvedValue({ id: "sess-1" });
  attachMock.mockReturnValue(detachMock);
  selectStructureByIdMock.mockResolvedValue(WORKFLOW_STRUCTURE);
  checkAccessMock.mockResolvedValue(true);
  checkBudgetMock.mockResolvedValue({ allowed: true });
  resolveAllowListMock.mockResolvedValue(null);
  executorRunMock.mockResolvedValue({ isOk: true });
  createExecutorMock.mockReturnValue({
    run: executorRunMock,
    subscribe: vi.fn(),
  });
  isKillSwitchActiveMock.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── tickOnce: schedule → session materialization ──────────────────────────────

describe("tickOnce — schedule materialization", () => {
  it("creates a session per due schedule with originSurface 'schedule' and mode 'autopilot'", async () => {
    claimDueSchedulesMock.mockResolvedValue([SCHEDULE]);
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledWith({
      kind: "workflow",
      definitionId: "wf-1",
      revisionId: null,
      teamId: "team-1",
      userId: "user-1",
      originSurface: "schedule",
      mode: "autopilot",
      inputPayload: { query: "daily" },
    });
    expect(counts.scheduled).toBe(1);
  });

  it("pins the session revision when the schedule is pinned", async () => {
    claimDueSchedulesMock.mockResolvedValue([
      {
        ...SCHEDULE,
        revisionPin: "pinned",
        pinnedRevisionId: "rev-9",
      } as unknown as WorkflowScheduleEntity,
    ]);
    const { tickOnce } = await import("./worker");
    await tickOnce();
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: "rev-9" }),
    );
  });

  it("counts a failed createSession as failed and keeps going", async () => {
    claimDueSchedulesMock.mockResolvedValue([
      SCHEDULE,
      { ...SCHEDULE, id: "sched-2" } as unknown as WorkflowScheduleEntity,
    ]);
    createSessionMock
      .mockRejectedValueOnce(new Error("insert failed"))
      .mockResolvedValueOnce({ id: "sess-2" });
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();
    expect(counts.scheduled).toBe(1);
    expect(counts.failed).toBe(1);
    expect(createSessionMock).toHaveBeenCalledTimes(2);
  });

  it("survives claimDueSchedules throwing (returns zero counts)", async () => {
    claimDueSchedulesMock.mockRejectedValue(new Error("db down"));
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();
    expect(counts).toEqual({ scheduled: 0, executed: 0, failed: 0 });
  });
});

// ── claimQueuedSession ─────────────────────────────────────────────────────────

describe("claimQueuedSession", () => {
  it("returns null when nothing is claimable", async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const { claimQueuedSession } = await import("./worker");
    expect(await claimQueuedSession()).toBeNull();
  });

  it("maps the claimed snake_case row to an entity", async () => {
    executeMock.mockResolvedValue({ rows: [RAW_SESSION_ROW] });
    const { claimQueuedSession } = await import("./worker");
    const session = await claimQueuedSession();
    expect(session?.id).toBe("sess-1");
    expect(session?.definitionId).toBe("wf-1");
    expect(session?.originSurface).toBe("schedule");
    expect(session?.mode).toBe("autopilot");
    expect(session?.inputPayload).toEqual({ query: "daily" });
  });
});

// ── runClaimedSession ─────────────────────────────────────────────────────────

describe("runClaimedSession", () => {
  it("kill switch active → session is re-queued, never run", async () => {
    isKillSwitchActiveMock.mockResolvedValue(true);
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);

    expect(outcome).toBe("requeued");
    // re-queued via update set({status:'queued'})
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "queued" }),
    );
    expect(createExecutorMock).not.toHaveBeenCalled();
    expect(attachMock).not.toHaveBeenCalled();
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it("attaches session persistence and runs the workflow with the session input", async () => {
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);

    expect(outcome).toBe("completed");
    expect(selectStructureByIdMock).toHaveBeenCalledWith("wf-1");
    expect(attachMock).toHaveBeenCalledWith(expect.anything(), "sess-1");
    expect(executorRunMock).toHaveBeenCalledWith(
      { query: "daily" },
      expect.objectContaining({ disableHistory: true }),
    );
    expect(detachMock).toHaveBeenCalledTimes(1);
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it("executor.run resolving isOk=false → failSession called", async () => {
    executorRunMock.mockResolvedValue({
      isOk: false,
      error: new Error("node exploded"),
    });
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);
    expect(outcome).toBe("failed");
    expect(failSessionMock).toHaveBeenCalledWith("sess-1", "node exploded");
    expect(detachMock).toHaveBeenCalledTimes(1);
  });

  it("executor.run throwing → failSession called and persistence detached", async () => {
    executorRunMock.mockRejectedValue(new Error("boom"));
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);
    expect(outcome).toBe("failed");
    expect(failSessionMock).toHaveBeenCalledWith("sess-1", "boom");
    expect(detachMock).toHaveBeenCalledTimes(1);
  });

  it("missing workflow structure → failSession, executor never built", async () => {
    selectStructureByIdMock.mockResolvedValue(null);
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);
    expect(outcome).toBe("failed");
    expect(failSessionMock).toHaveBeenCalledWith(
      "sess-1",
      expect.stringContaining("wf-1"),
    );
    expect(createExecutorMock).not.toHaveBeenCalled();
  });

  // ── W3/ADR-0009: budget gate + access re-verification (defense in depth) ──

  it("re-verifies workflow access at execution time (IDOR defense)", async () => {
    const { runClaimedSession } = await import("./worker");
    await runClaimedSession(SESSION);
    expect(checkAccessMock).toHaveBeenCalledWith("wf-1", "user-1", true);
  });

  it("owner who lost access → failSession, executor never built", async () => {
    checkAccessMock.mockResolvedValue(false);
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);
    expect(outcome).toBe("failed");
    expect(failSessionMock).toHaveBeenCalledWith(
      "sess-1",
      expect.stringContaining("no longer has access"),
    );
    expect(createExecutorMock).not.toHaveBeenCalled();
  });

  it("budget exhausted → failSession with the budget reason, executor never built", async () => {
    checkBudgetMock.mockResolvedValue({
      allowed: false,
      reason: "Team budget exhausted",
    });
    const { runClaimedSession } = await import("./worker");
    const outcome = await runClaimedSession(SESSION);
    expect(outcome).toBe("failed");
    expect(failSessionMock).toHaveBeenCalledWith(
      "sess-1",
      "Team budget exhausted",
    );
    expect(createExecutorMock).not.toHaveBeenCalled();
  });

  it("passes the owner's team + effective allow-list into the executor", async () => {
    resolveAllowListMock.mockResolvedValue(["deepseek-v4-flash"]);
    const { runClaimedSession } = await import("./worker");
    await runClaimedSession(SESSION);
    expect(createExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        teamId: "team-1",
        effectiveModelAllowList: ["deepseek-v4-flash"],
      }),
    );
  });
});

// ── tickOnce: session claim loop ──────────────────────────────────────────────

describe("tickOnce — session claim loop", () => {
  it("executes claimed sessions and counts them", async () => {
    executeMock
      .mockResolvedValueOnce({ rows: [RAW_SESSION_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();
    expect(counts).toEqual({ scheduled: 0, executed: 1, failed: 0 });
  });

  it("caps execution at maxSessions per tick (default 3)", async () => {
    // Claim always returns a session — the cap must stop the loop.
    executeMock.mockResolvedValue({ rows: [RAW_SESSION_ROW] });
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();
    expect(counts.executed).toBe(3);
    expect(executorRunMock).toHaveBeenCalledTimes(3);
  });

  it("kill switch mid-tick → claimed session re-queued, loop stops", async () => {
    executeMock.mockResolvedValue({ rows: [RAW_SESSION_ROW] });
    isKillSwitchActiveMock.mockResolvedValue(true);
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();
    // re-queued: not executed, not failed, and no claim/requeue spin
    expect(counts).toEqual({ scheduled: 0, executed: 0, failed: 0 });
    expect(executorRunMock).not.toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "queued" }),
    );
    expect(executeMock).toHaveBeenCalledTimes(1); // single claim, then break
  });

  it("a failing session run is counted as failed and the tick continues", async () => {
    executeMock
      .mockResolvedValueOnce({ rows: [RAW_SESSION_ROW] })
      .mockResolvedValueOnce({
        rows: [{ ...RAW_SESSION_ROW, id: "sess-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    executorRunMock
      .mockResolvedValueOnce({ isOk: false, error: new Error("bad") })
      .mockResolvedValueOnce({ isOk: true });
    const { tickOnce } = await import("./worker");
    const counts = await tickOnce();
    expect(counts).toEqual({ scheduled: 0, executed: 1, failed: 1 });
    expect(failSessionMock).toHaveBeenCalledWith("sess-1", "bad");
  });
});

// ── startWorkerLoop ───────────────────────────────────────────────────────────

describe("startWorkerLoop", () => {
  const RESULT: TickResult = { scheduled: 0, executed: 0, failed: 0 };

  it("ticks on the interval and reports results", async () => {
    vi.useFakeTimers();
    const tick = vi.fn().mockResolvedValue(RESULT);
    const onTick = vi.fn();
    const { startWorkerLoop } = await import("./worker");
    const loop = startWorkerLoop({ intervalMs: 1000, tick, onTick });

    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenCalledWith(RESULT);
    await loop.stop();
  });

  it("overlap guard: a slow tick makes the next interval skip", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const tick = vi.fn().mockImplementation(
      () =>
        new Promise<TickResult>((resolve) => {
          release = () => resolve(RESULT);
        }),
    );
    const { startWorkerLoop } = await import("./worker");
    const loop = startWorkerLoop({ intervalMs: 1000, tick });

    // 3 intervals elapse while the first tick is still in flight.
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(1);

    // Finish the slow tick — the next interval may tick again.
    release?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);

    release?.();
    await loop.stop();
  });

  it("stop() clears the interval and resolves after the in-flight tick", async () => {
    vi.useFakeTimers();
    const tick = vi.fn().mockResolvedValue(RESULT);
    const { startWorkerLoop } = await import("./worker");
    const loop = startWorkerLoop({ intervalMs: 1000, tick });

    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(1);

    await loop.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1); // no ticks after stop
  });

  it("a rejecting tick does not kill the loop", async () => {
    vi.useFakeTimers();
    const tick = vi
      .fn()
      .mockRejectedValueOnce(new Error("tick exploded"))
      .mockResolvedValue(RESULT);
    const { startWorkerLoop } = await import("./worker");
    const loop = startWorkerLoop({ intervalMs: 1000, tick });

    await vi.advanceTimersByTimeAsync(2000);
    expect(tick).toHaveBeenCalledTimes(2);
    await loop.stop();
  });
});
