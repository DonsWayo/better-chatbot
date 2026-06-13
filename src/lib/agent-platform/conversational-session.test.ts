import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chains ───────────────────────────────────────────────────────
// recordAgentChatTurn uses, in order:
//   select().from().where().orderBy().limit()  → findSessionForThread
//   select().from().where()                    → nextTurnIndex (COUNT)
//   recordStep(...)                            → mocked (./sessions)
//   sumStepCost(...)                           → mocked (./sessions)
//   insert().values().returning()              → create session (first turn)
//   update().set().where()                     → roll cost + complete
//
// We queue select() results FIFO and capture insert .values / update .set so
// the tests assert the exact persisted rows at the db boundary.

const insertReturningMock = vi.fn();
const insertValuesMock = vi
  .fn()
  .mockReturnValue({ returning: insertReturningMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

const updateWhereMock = vi.fn().mockResolvedValue(undefined);
const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

const selectResults: unknown[][] = [];
function nextSelectResult(): unknown[] {
  return selectResults.length > 0 ? (selectResults.shift() as unknown[]) : [];
}

// One chain per select(); the queued result is consumed once, on first await.
function makeSelectChain() {
  let resolved: unknown[] | null = null;
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown) => {
      if (resolved === null) resolved = nextSelectResult();
      return resolve(resolved);
    },
  };
  return chain;
}
const selectMock = vi.fn().mockImplementation(makeSelectChain);

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
    kind: "agent_session.kind",
    definitionId: "agent_session.definition_id",
    costSoFar: "agent_session.cost_so_far",
    inputPayload: "agent_session.input_payload",
    createdAt: "agent_session.created_at",
  },
  AgentStepTable: {
    id: "agent_step.id",
    sessionId: "agent_step.session_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  desc: vi.fn((col: unknown) => ({ _desc: col })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({
      _sql: [strings, vals],
    })),
    { raw: vi.fn() },
  ),
}));

const recordStepMock = vi.fn().mockResolvedValue({ id: "step-1" });
const sumStepCostMock = vi.fn().mockResolvedValue(0);
vi.mock("./sessions", () => ({
  recordStep: (...args: unknown[]) => recordStepMock(...args),
  sumStepCost: (...args: unknown[]) => sumStepCostMock(...args),
}));

const resolveRunnableRevisionMock = vi.fn().mockResolvedValue(null);
vi.mock("./revisions", () => ({
  resolveRunnableRevision: (...args: unknown[]) =>
    resolveRunnableRevisionMock(...args),
}));

vi.mock("server-only", () => ({}));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ error: vi.fn(), info: vi.fn() }) },
}));

function lastInsertValues(): Record<string, unknown> {
  const call = insertValuesMock.mock.calls.at(-1);
  if (!call) throw new Error("insert .values was never called");
  return call[0] as Record<string, unknown>;
}
function lastUpdateSet(): Record<string, unknown> {
  const call = updateSetMock.mock.calls.at(-1);
  if (!call) throw new Error("update .set was never called");
  return call[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults.length = 0;
  insertReturningMock.mockResolvedValue([{ id: "sess-1", costSoFar: 0 }]);
  insertValuesMock.mockReturnValue({ returning: insertReturningMock });
  insertMock.mockReturnValue({ values: insertValuesMock });
  updateWhereMock.mockResolvedValue(undefined);
  updateSetMock.mockReturnValue({ where: updateWhereMock });
  updateMock.mockReturnValue({ set: updateSetMock });
  selectMock.mockImplementation(makeSelectChain);
  recordStepMock.mockResolvedValue({ id: "step-1" });
  sumStepCostMock.mockResolvedValue(0);
  resolveRunnableRevisionMock.mockResolvedValue(null);
});

describe("recordAgentChatTurn — first turn (new session)", () => {
  it("creates a conversational session keyed by threadId and records turn 0", async () => {
    // findSessionForThread → no existing session
    selectResults.push([]);
    // nextTurnIndex → 0 steps so far
    selectResults.push([{ count: 0 }]);
    sumStepCostMock.mockResolvedValue(0.0021);

    const { recordAgentChatTurn } = await import("./conversational-session");
    const id = await recordAgentChatTurn({
      threadId: "11111111-1111-1111-1111-111111111111",
      agentId: "agent-9",
      agentName: "Sales Copilot",
      userId: "user-1",
      teamId: "team-1",
      userText: "  hello there  ",
      assistantText: "Hi! How can I help?",
      costUsd: 0.0021,
    });

    expect(id).toBe("sess-1");

    const values = lastInsertValues();
    expect(values.kind).toBe("conversational");
    expect(values.definitionId).toBe("agent-9");
    expect(values.userId).toBe("user-1");
    expect(values.teamId).toBe("team-1");
    expect(values.originSurface).toBe("web");
    expect(values.mode).toBe("interactive");
    expect((values.inputPayload as { threadId: string }).threadId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect((values.inputPayload as { agentName: string }).agentName).toBe(
      "Sales Copilot",
    );

    // turn recorded as step 0, nodeKind 'turn'
    expect(recordStepMock).toHaveBeenCalledTimes(1);
    const [, step] = recordStepMock.mock.calls[0];
    expect(step.stepIndex).toBe(0);
    expect(step.nodeKind).toBe("turn");
    expect(step.nodeId).toBe("turn-0");
    expect(step.status).toBe("completed");
    expect(step.costUsd).toBe(0.0021);
    // user text trimmed (no leading/trailing whitespace) and content-hashed
    expect(step.input.preview).toBe("hello there");
    expect(typeof step.input.hash).toBe("string");
    expect(step.output.preview).toBe("Hi! How can I help?");

    // cost rolled into cost_so_far from the authoritative per-step sum; session
    // marked completed (turn finished generating before onFinish ran)
    const set = lastUpdateSet();
    expect(set.costSoFar).toBe(0.0021);
    expect(set.status).toBe("completed");
    expect(set.endedAt).toBeInstanceOf(Date);
  });

  it("pins the agent's published revision when one exists", async () => {
    selectResults.push([]); // no existing session
    selectResults.push([{ count: 0 }]);
    resolveRunnableRevisionMock.mockResolvedValue({ id: "rev-42" });

    const { recordAgentChatTurn } = await import("./conversational-session");
    await recordAgentChatTurn({
      threadId: "22222222-2222-2222-2222-222222222222",
      agentId: "agent-9",
      userId: "user-1",
      userText: "q",
      assistantText: "a",
      costUsd: 0,
    });

    expect(resolveRunnableRevisionMock).toHaveBeenCalledWith(
      "conversational",
      "agent-9",
    );
    expect(lastInsertValues().revisionId).toBe("rev-42");
  });
});

describe("recordAgentChatTurn — subsequent turn (reuse session)", () => {
  it("reuses the existing session and appends the next turn index", async () => {
    // findSessionForThread → existing session, with one prior turn
    selectResults.push([{ id: "sess-7", costSoFar: 0.005 }]);
    // nextTurnIndex → 1 step already recorded
    selectResults.push([{ count: 1 }]);
    sumStepCostMock.mockResolvedValue(0.009);

    const { recordAgentChatTurn } = await import("./conversational-session");
    const id = await recordAgentChatTurn({
      threadId: "33333333-3333-3333-3333-333333333333",
      agentId: "agent-9",
      userId: "user-1",
      userText: "second question",
      assistantText: "second answer",
      costUsd: 0.004,
    });

    expect(id).toBe("sess-7");
    // No new session inserted on a reuse
    expect(insertMock).not.toHaveBeenCalled();
    // Turn recorded at index 1 against the existing session
    const [sessionId, step] = recordStepMock.mock.calls[0];
    expect(sessionId).toBe("sess-7");
    expect(step.stepIndex).toBe(1);
    expect(step.nodeId).toBe("turn-1");
    expect(lastUpdateSet().costSoFar).toBe(0.009);
  });
});

describe("recordAgentChatTurn — fail-open", () => {
  it("returns null and never throws when the db errors", async () => {
    selectMock.mockImplementation(() => {
      throw new Error("db down");
    });

    const { recordAgentChatTurn } = await import("./conversational-session");
    await expect(
      recordAgentChatTurn({
        threadId: "44444444-4444-4444-4444-444444444444",
        agentId: "agent-9",
        userId: "user-1",
        userText: "x",
        assistantText: "y",
        costUsd: 0,
      }),
    ).resolves.toBeNull();
  });

  it("bounds the stored preview to 2000 chars and flags truncation", async () => {
    selectResults.push([]);
    selectResults.push([{ count: 0 }]);

    const { recordAgentChatTurn } = await import("./conversational-session");
    const long = "a".repeat(5000);
    await recordAgentChatTurn({
      threadId: "55555555-5555-5555-5555-555555555555",
      agentId: "agent-9",
      userId: "user-1",
      userText: long,
      assistantText: "ok",
      costUsd: 0,
    });

    const [, step] = recordStepMock.mock.calls[0];
    expect(step.input.preview).toHaveLength(2000);
    expect(step.input.truncated).toBe(true);
    expect(step.input.chars).toBe(5000);
  });
});
