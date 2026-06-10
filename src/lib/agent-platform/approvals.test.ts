import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Drizzle mock chain (same style as lib/admin/model-policy.test.ts) ────────
// select().from(T)[.innerJoin()].where()[.orderBy()][.limit()] resolves to
// rows that depend on which mocked table was queried (and whether the query
// joined), so approval / team-membership / joined list selects can each be
// fed independently. insert/update chains capture their arguments for
// assertions.

const h = vi.hoisted(() => {
  const state = {
    approvalRows: [] as unknown[],
    teamMemberRows: [] as unknown[],
    joinedRows: [] as unknown[],
    insertedRows: [] as unknown[],
    updateReturningRows: [] as unknown[],
    updateCalls: [] as { tbl: string; set: Record<string, unknown> }[],
  };

  const fromMock = vi.fn((table: { _tbl?: string } | undefined) => {
    let joined = false;
    const rows = () => {
      if (joined) return state.joinedRows;
      if (table?._tbl === "teamMember") return state.teamMemberRows;
      return state.approvalRows;
    };
    const chain = {
      innerJoin: vi.fn(() => {
        joined = true;
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(rows())),
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(rows()).then(onFulfilled, onRejected),
    };
    return chain;
  });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const insertReturningMock = vi.fn(() => Promise.resolve(state.insertedRows));
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ returning: insertReturningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  const updateMock = vi.fn((table: { _tbl?: string } | undefined) => ({
    set: vi.fn((set: Record<string, unknown>) => {
      state.updateCalls.push({ tbl: table?._tbl ?? "unknown", set });
      return {
        where: vi.fn(() => {
          const promise = Promise.resolve(state.updateReturningRows);
          return Object.assign(promise, {
            returning: vi.fn(() => Promise.resolve(state.updateReturningRows)),
          });
        }),
      };
    }),
  }));

  const failSessionMock = vi.fn().mockResolvedValue(null);

  const eqMock = vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] }));
  const andMock = vi.fn((...args: unknown[]) => ({ and: args }));
  const orMock = vi.fn((...args: unknown[]) => ({ or: args }));
  const inArrayMock = vi.fn((col: unknown, values: unknown) => ({
    inArray: [col, values],
  }));
  const descMock = vi.fn((col: unknown) => ({ desc: col }));

  return {
    state,
    fromMock,
    selectMock,
    insertMock,
    insertValuesMock,
    updateMock,
    failSessionMock,
    eqMock,
    andMock,
    orMock,
    inArrayMock,
    descMock,
  };
});

const {
  state,
  selectMock,
  insertValuesMock,
  failSessionMock,
  orMock,
  inArrayMock,
} = h;

vi.mock("server-only", () => ({}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: h.selectMock, insert: h.insertMock, update: h.updateMock },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  ApprovalRequestTable: {
    _tbl: "approval",
    id: "approval.id",
    sessionId: "approval.sessionId",
    status: "approval.status",
    requestedRole: "approval.requestedRole",
    requestedAt: "approval.requestedAt",
  },
  AgentSessionTable: {
    _tbl: "session",
    id: "session.id",
    userId: "session.userId",
    teamId: "session.teamId",
  },
  AsafeTeamMemberTable: {
    _tbl: "teamMember",
    id: "teamMember.id",
    teamId: "teamMember.teamId",
    userId: "teamMember.userId",
    role: "teamMember.role",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: h.eqMock,
  and: h.andMock,
  or: h.orMock,
  inArray: h.inArrayMock,
  desc: h.descMock,
}));

vi.mock("./sessions", () => ({ failSession: h.failSessionMock }));

import {
  canDecide,
  createApprovalRequest,
  decideApproval,
  getApprovalForSession,
  listPendingApprovalsForUser,
} from "./approvals";

function updateCallsFor(tbl: string) {
  return state.updateCalls.filter((c) => c.tbl === tbl);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.approvalRows = [];
  state.teamMemberRows = [];
  state.joinedRows = [];
  state.insertedRows = [];
  state.updateReturningRows = [];
  state.updateCalls = [];
});

// ── createApprovalRequest ────────────────────────────────────────────────────

describe("createApprovalRequest", () => {
  it("inserts a pending row with the team-admin default role and returns it", async () => {
    state.insertedRows = [{ id: "a1", sessionId: "s1", status: "pending" }];
    const result = await createApprovalRequest({
      sessionId: "s1",
      stepIndex: 2,
    });
    expect(insertValuesMock).toHaveBeenCalledWith({
      sessionId: "s1",
      stepIndex: 2,
      payload: null,
      requestedRole: "team-admin",
    });
    expect(result).toEqual({ id: "a1", sessionId: "s1", status: "pending" });
  });

  it("parks the session: status flips to awaiting_approval", async () => {
    state.insertedRows = [{ id: "a1" }];
    await createApprovalRequest({ sessionId: "s1", stepIndex: 0 });
    const sessionUpdates = updateCallsFor("session");
    expect(sessionUpdates).toHaveLength(1);
    expect(sessionUpdates[0].set).toEqual(
      expect.objectContaining({
        status: "awaiting_approval",
        error: null,
        endedAt: null,
      }),
    );
  });

  it("passes payload and an explicit requestedRole through", async () => {
    state.insertedRows = [{ id: "a2" }];
    await createApprovalRequest({
      sessionId: "s1",
      stepIndex: 3,
      payload: { plan: ["step 1", "step 2"] },
      requestedRole: "owner",
    });
    expect(insertValuesMock).toHaveBeenCalledWith({
      sessionId: "s1",
      stepIndex: 3,
      payload: { plan: ["step 1", "step 2"] },
      requestedRole: "owner",
    });
  });
});

// ── decideApproval ───────────────────────────────────────────────────────────

describe("decideApproval", () => {
  it("approve marks the request approved and re-queues the session", async () => {
    state.approvalRows = [{ id: "a1", status: "pending", sessionId: "s1" }];
    state.updateReturningRows = [{ id: "a1", status: "approved" }];

    const result = await decideApproval("a1", {
      decidedBy: "u1",
      approve: true,
    });

    const approvalUpdates = updateCallsFor("approval");
    expect(approvalUpdates).toHaveLength(1);
    expect(approvalUpdates[0].set).toEqual(
      expect.objectContaining({
        status: "approved",
        decidedBy: "u1",
        decidedAt: expect.any(Date),
        reason: null,
      }),
    );
    const sessionUpdates = updateCallsFor("session");
    expect(sessionUpdates).toHaveLength(1);
    expect(sessionUpdates[0].set).toEqual(
      expect.objectContaining({ status: "queued", error: null }),
    );
    expect(failSessionMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "a1", status: "approved" });
  });

  it("reject marks the request rejected and fails the session with the reason", async () => {
    state.approvalRows = [{ id: "a1", status: "pending", sessionId: "s1" }];
    state.updateReturningRows = [{ id: "a1", status: "rejected" }];

    await decideApproval("a1", {
      decidedBy: "u2",
      approve: false,
      reason: "too risky",
    });

    expect(updateCallsFor("approval")[0].set).toEqual(
      expect.objectContaining({
        status: "rejected",
        decidedBy: "u2",
        reason: "too risky",
      }),
    );
    expect(failSessionMock).toHaveBeenCalledWith("s1", "Rejected: too risky");
    expect(updateCallsFor("session")).toHaveLength(0);
  });

  it("reject without a reason still fails the session with a Rejected error", async () => {
    state.approvalRows = [{ id: "a1", status: "pending", sessionId: "s1" }];
    state.updateReturningRows = [{ id: "a1", status: "rejected" }];
    await decideApproval("a1", { decidedBy: "u2", approve: false });
    expect(failSessionMock).toHaveBeenCalledWith(
      "s1",
      "Rejected: no reason given",
    );
  });

  it("throws 'Already decided' when the request is no longer pending", async () => {
    state.approvalRows = [{ id: "a1", status: "approved", sessionId: "s1" }];
    await expect(
      decideApproval("a1", { decidedBy: "u1", approve: true }),
    ).rejects.toThrow("Already decided");
    expect(state.updateCalls).toHaveLength(0);
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it("throws when the request does not exist", async () => {
    state.approvalRows = [];
    await expect(
      decideApproval("ghost", { decidedBy: "u1", approve: true }),
    ).rejects.toThrow("Approval request not found");
  });
});

// ── canDecide matrix ─────────────────────────────────────────────────────────

describe("canDecide", () => {
  it("global admins can decide any requestedRole", async () => {
    for (const requestedRole of ["owner", "team-admin", "admin"] as const) {
      await expect(
        canDecide("u-admin", true, {
          requestedRole,
          sessionUserId: "someone-else",
          sessionTeamId: "t1",
        }),
      ).resolves.toBe(true);
    }
  });

  it("owner role: only the session owner may decide", async () => {
    const ctx = {
      requestedRole: "owner" as const,
      sessionUserId: "u1",
      sessionTeamId: "t1",
    };
    await expect(canDecide("u1", false, ctx)).resolves.toBe(true);
    await expect(canDecide("u2", false, ctx)).resolves.toBe(false);
  });

  it("team-admin role: a team admin of the session's team may decide", async () => {
    state.teamMemberRows = [{ id: "m1" }];
    await expect(
      canDecide("u1", false, {
        requestedRole: "team-admin",
        sessionUserId: "owner",
        sessionTeamId: "t1",
      }),
    ).resolves.toBe(true);
  });

  it("team-admin role: a plain member (no admin membership row) may not", async () => {
    state.teamMemberRows = [];
    await expect(
      canDecide("u1", false, {
        requestedRole: "team-admin",
        sessionUserId: "owner",
        sessionTeamId: "t1",
      }),
    ).resolves.toBe(false);
  });

  it("team-admin role: a session without a team cannot be team-decided", async () => {
    await expect(
      canDecide("u1", false, {
        requestedRole: "team-admin",
        sessionUserId: "owner",
        sessionTeamId: null,
      }),
    ).resolves.toBe(false);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("admin role: non-global-admins may never decide", async () => {
    await expect(
      canDecide("u1", false, {
        requestedRole: "admin",
        sessionUserId: "u1", // even the owner
        sessionTeamId: "t1",
      }),
    ).resolves.toBe(false);
  });
});

// ── listPendingApprovalsForUser ──────────────────────────────────────────────

describe("listPendingApprovalsForUser", () => {
  const joined = [
    {
      request: { id: "a1", requestedRole: "owner", status: "pending" },
      session: { id: "s1", userId: "u1", teamId: null },
    },
  ];

  it("global admins see every pending request (no per-user scoping)", async () => {
    state.joinedRows = joined;
    await expect(listPendingApprovalsForUser("u-admin", true)).resolves.toEqual(
      joined,
    );
    expect(orMock).not.toHaveBeenCalled();
    expect(inArrayMock).not.toHaveBeenCalled();
  });

  it("non-admins with admin teams get owner OR team-admin scoping", async () => {
    state.teamMemberRows = [{ teamId: "t1" }, { teamId: "t2" }];
    state.joinedRows = joined;
    await expect(listPendingApprovalsForUser("u1", false)).resolves.toEqual(
      joined,
    );
    expect(orMock).toHaveBeenCalledTimes(1);
    expect(inArrayMock).toHaveBeenCalledWith("session.teamId", ["t1", "t2"]);
  });

  it("non-admins without admin teams only get the owner scope", async () => {
    state.teamMemberRows = [];
    state.joinedRows = [];
    await expect(listPendingApprovalsForUser("u1", false)).resolves.toEqual([]);
    expect(orMock).not.toHaveBeenCalled();
    expect(inArrayMock).not.toHaveBeenCalled();
  });
});

// ── getApprovalForSession ────────────────────────────────────────────────────

describe("getApprovalForSession", () => {
  it("returns the latest request for the session", async () => {
    state.approvalRows = [{ id: "a-latest", sessionId: "s1" }];
    await expect(getApprovalForSession("s1")).resolves.toEqual({
      id: "a-latest",
      sessionId: "s1",
    });
  });

  it("returns null when the session has no requests", async () => {
    state.approvalRows = [];
    await expect(getApprovalForSession("s1")).resolves.toBeNull();
  });
});
