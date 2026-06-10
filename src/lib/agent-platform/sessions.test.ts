import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chains ───────────────────────────────────────────────────────
// insert().values(v).returning() → Promise<rows>
// insert().values(v).onConflictDoUpdate(cfg).returning() → Promise<rows>
// update().set(v).where(cond) → thenable + .returning() → Promise<rows>
// select().from().where().orderBy().limit() → Promise<rows>
//
// We capture `.values(...)` / `.set(...)` / `.onConflictDoUpdate(...)` args so
// the tests assert on the exact persisted row at the db boundary.

const insertReturningMock = vi.fn();
const onConflictDoUpdateMock = vi
  .fn()
  .mockReturnValue({ returning: insertReturningMock });
const insertValuesMock = vi.fn().mockReturnValue({
  returning: insertReturningMock,
  onConflictDoUpdate: onConflictDoUpdateMock,
});
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

const updateReturningMock = vi.fn();
// update().set().where() must be awaitable directly (touchHeartbeat) AND
// support .returning() (status transitions) → thenable object.
function makeUpdateWhereResult() {
  return {
    returning: updateReturningMock,
    then: (resolve: (v: unknown) => unknown) => resolve(undefined),
  };
}
const updateWhereMock = vi.fn().mockImplementation(makeUpdateWhereResult);
const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

const selectResults: unknown[][] = [];
const selectLimitMock = vi.fn();
const selectOrderByMock = vi.fn();
const selectWhereMock = vi.fn();
const selectFromMock = vi.fn();
const selectMock = vi.fn();

function nextSelectResult(): unknown[] {
  return selectResults.length > 0 ? (selectResults.shift() as unknown[]) : [];
}

// One chain per select(); the queued result is consumed once, on first await.
function makeSelectChain() {
  let resolved: unknown[] | null = null;
  const chain = {
    from: (...args: unknown[]) => {
      selectFromMock(...args);
      return chain;
    },
    where: (...args: unknown[]) => {
      selectWhereMock(...args);
      return chain;
    },
    orderBy: (...args: unknown[]) => {
      selectOrderByMock(...args);
      return chain;
    },
    limit: (...args: unknown[]) => {
      selectLimitMock(...args);
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      if (resolved === null) resolved = nextSelectResult();
      return resolve(resolved);
    },
  };
  return chain;
}

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: insertMock,
    update: updateMock,
    select: selectMock,
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AgentSessionTable: {
    id: "agent_session.id",
    userId: "agent_session.user_id",
    teamId: "agent_session.team_id",
    status: "agent_session.status",
    createdAt: "agent_session.created_at",
  },
  AgentStepTable: {
    id: "agent_step.id",
    sessionId: "agent_step.session_id",
    stepIndex: "agent_step.step_index",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ _inArray: [col, vals] })),
  asc: vi.fn((col: unknown) => ({ _asc: col })),
  desc: vi.fn((col: unknown) => ({ _desc: col })),
}));

vi.mock("server-only", () => ({}));

/** Helper: the object handed to `.values(...)` on the latest insert. */
function lastInsertValues(): Record<string, unknown> {
  const call = insertValuesMock.mock.calls.at(-1);
  if (!call) throw new Error("insert .values was never called");
  return call[0] as Record<string, unknown>;
}

/** Helper: the object handed to `.set(...)` on the latest update. */
function lastUpdateSet(): Record<string, unknown> {
  const call = updateSetMock.mock.calls.at(-1);
  if (!call) throw new Error("update .set was never called");
  return call[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults.length = 0;
  insertReturningMock.mockResolvedValue([{ id: "sess-1" }]);
  onConflictDoUpdateMock.mockReturnValue({ returning: insertReturningMock });
  insertValuesMock.mockReturnValue({
    returning: insertReturningMock,
    onConflictDoUpdate: onConflictDoUpdateMock,
  });
  insertMock.mockReturnValue({ values: insertValuesMock });
  updateReturningMock.mockResolvedValue([{ id: "sess-1" }]);
  updateWhereMock.mockImplementation(makeUpdateWhereResult);
  updateSetMock.mockReturnValue({ where: updateWhereMock });
  updateMock.mockReturnValue({ set: updateSetMock });
  selectMock.mockImplementation(makeSelectChain);
});

describe("createSession", () => {
  it("inserts a queued session with web/interactive defaults", async () => {
    const { createSession } = await import("./sessions");
    await createSession({
      kind: "workflow",
      definitionId: "wf-1",
      userId: "user-1",
    });
    const values = lastInsertValues();
    expect(values.status).toBe("queued");
    expect(values.originSurface).toBe("web");
    expect(values.mode).toBe("interactive");
    expect(values.kind).toBe("workflow");
    expect(values.definitionId).toBe("wf-1");
    expect(values.userId).toBe("user-1");
  });

  it("nulls out optional fields when omitted", async () => {
    const { createSession } = await import("./sessions");
    await createSession({
      kind: "conversational",
      definitionId: "agent-1",
      userId: "user-1",
    });
    const values = lastInsertValues();
    expect(values.revisionId).toBeNull();
    expect(values.teamId).toBeNull();
    expect(values.folderId).toBeNull();
    expect(values.inputPayload).toBeNull();
    expect(values.parentSessionId).toBeNull();
  });

  it("persists explicit origin/mode/team/parent when provided", async () => {
    const { createSession } = await import("./sessions");
    await createSession({
      kind: "workflow",
      definitionId: "wf-1",
      userId: "user-1",
      teamId: "team-1",
      originSurface: "schedule",
      mode: "autopilot",
      parentSessionId: "sess-parent",
      inputPayload: { query: "hi" },
    });
    const values = lastInsertValues();
    expect(values.teamId).toBe("team-1");
    expect(values.originSurface).toBe("schedule");
    expect(values.mode).toBe("autopilot");
    expect(values.parentSessionId).toBe("sess-parent");
    expect(values.inputPayload).toEqual({ query: "hi" });
  });

  it("returns the inserted row", async () => {
    insertReturningMock.mockResolvedValue([
      { id: "sess-42", status: "queued" },
    ]);
    const { createSession } = await import("./sessions");
    const session = await createSession({
      kind: "workflow",
      definitionId: "wf-1",
      userId: "user-1",
    });
    expect(session).toEqual({ id: "sess-42", status: "queued" });
  });
});

describe("status transitions", () => {
  it("startSession sets running + startedAt + heartbeatAt", async () => {
    const { startSession } = await import("./sessions");
    await startSession("sess-1");
    const set = lastUpdateSet();
    expect(set.status).toBe("running");
    expect(set.startedAt).toBeInstanceOf(Date);
    expect(set.heartbeatAt).toBeInstanceOf(Date);
  });

  it("completeSession sets completed + endedAt and applies costSoFar", async () => {
    const { completeSession } = await import("./sessions");
    await completeSession("sess-1", { costSoFar: 1.25 });
    const set = lastUpdateSet();
    expect(set.status).toBe("completed");
    expect(set.endedAt).toBeInstanceOf(Date);
    expect(set.costSoFar).toBe(1.25);
  });

  it("completeSession without costSoFar leaves cost untouched", async () => {
    const { completeSession } = await import("./sessions");
    await completeSession("sess-1");
    const set = lastUpdateSet();
    expect(set.status).toBe("completed");
    expect("costSoFar" in set).toBe(false);
  });

  it("failSession sets failed + error message + endedAt", async () => {
    const { failSession } = await import("./sessions");
    await failSession("sess-1", "node exploded");
    const set = lastUpdateSet();
    expect(set.status).toBe("failed");
    expect(set.error).toBe("node exploded");
    expect(set.endedAt).toBeInstanceOf(Date);
  });

  it("cancelSession sets cancelled + endedAt", async () => {
    const { cancelSession } = await import("./sessions");
    await cancelSession("sess-1");
    const set = lastUpdateSet();
    expect(set.status).toBe("cancelled");
    expect(set.endedAt).toBeInstanceOf(Date);
  });

  it("transitions return null when no row matches", async () => {
    updateReturningMock.mockResolvedValue([]);
    const { startSession } = await import("./sessions");
    const result = await startSession("missing");
    expect(result).toBeNull();
  });
});

describe("touchHeartbeat", () => {
  it("updates heartbeatAt (and updatedAt) only", async () => {
    const { touchHeartbeat } = await import("./sessions");
    await touchHeartbeat("sess-1");
    const set = lastUpdateSet();
    expect(set.heartbeatAt).toBeInstanceOf(Date);
    expect(set.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(set).sort()).toEqual(["heartbeatAt", "updatedAt"]);
  });
});

describe("recordStep — upsert on (sessionId, stepIndex)", () => {
  it("NODE_START shape inserts a running step without endedAt", async () => {
    const { recordStep } = await import("./sessions");
    await recordStep("sess-1", {
      nodeId: "node-a",
      stepIndex: 0,
      status: "running",
      input: { x: 1 },
    });
    const values = lastInsertValues();
    expect(values.sessionId).toBe("sess-1");
    expect(values.nodeId).toBe("node-a");
    expect(values.stepIndex).toBe(0);
    expect(values.status).toBe("running");
    expect(values.input).toEqual({ x: 1 });
    expect(values.endedAt).toBeNull();
  });

  it("uses onConflictDoUpdate targeting (sessionId, stepIndex)", async () => {
    const { recordStep } = await import("./sessions");
    await recordStep("sess-1", {
      nodeId: "node-a",
      stepIndex: 0,
      status: "running",
    });
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    const cfg = onConflictDoUpdateMock.mock.calls[0][0] as {
      target: unknown[];
      set: Record<string, unknown>;
    };
    expect(cfg.target).toEqual([
      "agent_step.session_id",
      "agent_step.step_index",
    ]);
  });

  it("NODE_END shape updates same stepIndex to completed with output + endedAt", async () => {
    const { recordStep } = await import("./sessions");
    // insert running…
    await recordStep("sess-1", {
      nodeId: "node-a",
      stepIndex: 3,
      status: "running",
    });
    // …then the same stepIndex completes
    await recordStep("sess-1", {
      nodeId: "node-a",
      stepIndex: 3,
      status: "completed",
      output: { answer: 42 },
    });
    expect(insertValuesMock).toHaveBeenCalledTimes(2);
    const secondValues = insertValuesMock.mock.calls[1][0] as Record<
      string,
      unknown
    >;
    expect(secondValues.stepIndex).toBe(3);
    const cfg = onConflictDoUpdateMock.mock.calls[1][0] as {
      set: Record<string, unknown>;
    };
    expect(cfg.set.status).toBe("completed");
    expect(cfg.set.output).toEqual({ answer: 42 });
    expect(cfg.set.endedAt).toBeInstanceOf(Date);
  });

  it("conflict update does not wipe input when not provided", async () => {
    const { recordStep } = await import("./sessions");
    await recordStep("sess-1", {
      nodeId: "node-a",
      stepIndex: 0,
      status: "completed",
      output: { ok: true },
    });
    const cfg = onConflictDoUpdateMock.mock.calls[0][0] as {
      set: Record<string, unknown>;
    };
    expect("input" in cfg.set).toBe(false);
  });

  it("failed step stores the error and stamps endedAt", async () => {
    const { recordStep } = await import("./sessions");
    await recordStep("sess-1", {
      nodeId: "node-b",
      stepIndex: 1,
      status: "failed",
      error: "boom",
    });
    const values = lastInsertValues();
    expect(values.status).toBe("failed");
    expect(values.error).toBe("boom");
    expect(values.endedAt).toBeInstanceOf(Date);
    const cfg = onConflictDoUpdateMock.mock.calls[0][0] as {
      set: Record<string, unknown>;
    };
    expect(cfg.set.error).toBe("boom");
  });
});

describe("list / get", () => {
  it("listSessionsForUser filters by userId and applies default limit 50", async () => {
    selectResults.push([{ id: "sess-1" }]);
    const { listSessionsForUser } = await import("./sessions");
    const drizzle = await import("drizzle-orm");
    const rows = await listSessionsForUser("user-1");
    expect(rows).toEqual([{ id: "sess-1" }]);
    expect(drizzle.eq).toHaveBeenCalledWith("agent_session.user_id", "user-1");
    expect(selectLimitMock).toHaveBeenCalledWith(50);
  });

  it("listSessionsForUser honors an explicit limit", async () => {
    selectResults.push([]);
    const { listSessionsForUser } = await import("./sessions");
    await listSessionsForUser("user-1", { limit: 5 });
    expect(selectLimitMock).toHaveBeenCalledWith(5);
  });

  it("listActiveSessionsForTeam filters by teamId AND active statuses", async () => {
    selectResults.push([{ id: "sess-9" }]);
    const { listActiveSessionsForTeam } = await import("./sessions");
    const drizzle = await import("drizzle-orm");
    const rows = await listActiveSessionsForTeam("team-1");
    expect(rows).toEqual([{ id: "sess-9" }]);
    expect(drizzle.eq).toHaveBeenCalledWith("agent_session.team_id", "team-1");
    expect(drizzle.inArray).toHaveBeenCalledWith("agent_session.status", [
      "queued",
      "running",
      "awaiting_approval",
      "paused",
    ]);
    expect(drizzle.and).toHaveBeenCalled();
  });

  it("getSessionWithSteps returns session with ordered steps", async () => {
    selectResults.push([{ id: "sess-1", status: "completed" }]);
    selectResults.push([
      { id: "step-1", stepIndex: 0 },
      { id: "step-2", stepIndex: 1 },
    ]);
    const { getSessionWithSteps } = await import("./sessions");
    const drizzle = await import("drizzle-orm");
    const result = await getSessionWithSteps("sess-1");
    expect(result).toEqual({
      session: { id: "sess-1", status: "completed" },
      steps: [
        { id: "step-1", stepIndex: 0 },
        { id: "step-2", stepIndex: 1 },
      ],
    });
    expect(drizzle.asc).toHaveBeenCalledWith("agent_step.step_index");
  });

  it("getSessionWithSteps returns null when session not found", async () => {
    selectResults.push([]);
    const { getSessionWithSteps } = await import("./sessions");
    const result = await getSessionWithSteps("missing");
    expect(result).toBeNull();
  });
});
