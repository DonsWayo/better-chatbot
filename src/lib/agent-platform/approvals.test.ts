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
  const createSessionMock = vi.fn();
  const completeSessionMock = vi.fn().mockResolvedValue(null);
  const cancelSessionMock = vi.fn().mockResolvedValue(null);
  const writeAuditLogMock = vi.fn().mockResolvedValue(undefined);
  const armLocalServerMock = vi.fn(() => 1234567890);

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
    createSessionMock,
    completeSessionMock,
    cancelSessionMock,
    writeAuditLogMock,
    armLocalServerMock,
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
  completeSessionMock,
  cancelSessionMock,
  writeAuditLogMock,
  armLocalServerMock,
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
    definitionId: "session.definitionId",
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

vi.mock("./sessions", () => ({
  failSession: h.failSessionMock,
  createSession: h.createSessionMock,
  completeSession: h.completeSessionMock,
  cancelSession: h.cancelSessionMock,
}));

vi.mock("lib/compliance/audit", () => ({
  writeAuditLog: h.writeAuditLogMock,
}));

// Lazily imported by the local-MCP approve path; vi.mock intercepts the
// dynamic import too.
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { armLocalServer: h.armLocalServerMock },
}));

import {
  LOCAL_MCP_ARM_KIND,
  canDecide,
  createApprovalRequest,
  createLocalMcpArmRequest,
  decideApproval,
  getApprovalForSession,
  isLocalMcpArmPayload,
  listPendingApprovalsForUser,
  resolveOpenLocalMcpArmRequests,
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

// ── Local-MCP consent v2 (local_mcp_arm) ─────────────────────────────────────

const armPayload = {
  kind: LOCAL_MCP_ARM_KIND,
  serverId: "srv-1",
  serverName: "filesystem",
  toolName: "read_file",
  requestedBy: "owner-1",
  message: "Allow local tools",
};

describe("isLocalMcpArmPayload", () => {
  it("accepts a well-formed payload and rejects everything else", () => {
    expect(isLocalMcpArmPayload(armPayload)).toBe(true);
    expect(isLocalMcpArmPayload(null)).toBe(false);
    expect(isLocalMcpArmPayload({ kind: "other" })).toBe(false);
    expect(isLocalMcpArmPayload({ kind: LOCAL_MCP_ARM_KIND })).toBe(false);
    expect(isLocalMcpArmPayload({ message: "plan" })).toBe(false);
  });
});

describe("createLocalMcpArmRequest", () => {
  const input = {
    serverId: "srv-1",
    serverName: "filesystem",
    toolName: "read_file",
    userId: "owner-1",
  };

  it("creates a carrier session + owner-targeted request and audits it", async () => {
    state.joinedRows = []; // no open request → no dedupe
    h.createSessionMock.mockResolvedValue({ id: "carrier-1" });
    state.insertedRows = [
      { id: "req-1", sessionId: "carrier-1", status: "pending" },
    ];

    const { request, deduped } = await createLocalMcpArmRequest(input);

    expect(deduped).toBe(false);
    expect(request.id).toBe("req-1");
    expect(h.createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "conversational",
        definitionId: "srv-1",
        userId: "owner-1",
        originSurface: "desktop",
      }),
    );
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "carrier-1",
        requestedRole: "owner",
        payload: expect.objectContaining({
          kind: LOCAL_MCP_ARM_KIND,
          serverId: "srv-1",
          serverName: "filesystem",
          toolName: "read_file",
          requestedBy: "owner-1",
        }),
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        eventType: "admin_action",
        details: expect.objectContaining({
          action: "local_mcp_arm_requested",
          serverId: "srv-1",
          requestId: "req-1",
        }),
      }),
    );
  });

  it("dedupes: a still-open request for (server, user) is returned as-is", async () => {
    state.joinedRows = [
      {
        request: {
          id: "req-open",
          sessionId: "carrier-old",
          status: "pending",
          payload: armPayload,
        },
      },
    ];

    const { request, deduped } = await createLocalMcpArmRequest(input);

    expect(deduped).toBe(true);
    expect(request.id).toBe("req-open");
    expect(h.createSessionMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("ignores pending requests of other kinds when deduping", async () => {
    state.joinedRows = [
      {
        request: {
          id: "req-other",
          sessionId: "s-x",
          status: "pending",
          payload: { message: "generic plan approval" },
        },
      },
    ];
    h.createSessionMock.mockResolvedValue({ id: "carrier-2" });
    state.insertedRows = [{ id: "req-2", sessionId: "carrier-2" }];

    const { deduped } = await createLocalMcpArmRequest(input);
    expect(deduped).toBe(false);
    expect(h.createSessionMock).toHaveBeenCalled();
  });
});

describe("decideApproval — local_mcp_arm settlement", () => {
  it("approve arms the server (grantedBy = decider), completes the carrier and audits", async () => {
    state.approvalRows = [
      {
        id: "req-1",
        status: "pending",
        sessionId: "carrier-1",
        payload: armPayload,
      },
    ];
    state.updateReturningRows = [{ id: "req-1", status: "approved" }];

    const result = await decideApproval("req-1", {
      decidedBy: "admin-1",
      approve: true,
    });

    expect(result).toEqual({ id: "req-1", status: "approved" });
    expect(armLocalServerMock).toHaveBeenCalledWith("srv-1", {
      grantedBy: "admin-1",
    });
    expect(completeSessionMock).toHaveBeenCalledWith("carrier-1");
    // Never re-queued (the generic approve path) and never failed.
    expect(updateCallsFor("session")).toHaveLength(0);
    expect(failSessionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        details: expect.objectContaining({
          action: "local_mcp_arm_approved",
          serverId: "srv-1",
          armedUntil: 1234567890,
        }),
      }),
    );
  });

  it("deny leaves the server unarmed, cancels the carrier and audits the denial", async () => {
    state.approvalRows = [
      {
        id: "req-1",
        status: "pending",
        sessionId: "carrier-1",
        payload: armPayload,
      },
    ];
    state.updateReturningRows = [{ id: "req-1", status: "rejected" }];

    await decideApproval("req-1", {
      decidedBy: "owner-1",
      approve: false,
      reason: "not on this machine",
    });

    expect(armLocalServerMock).not.toHaveBeenCalled();
    expect(cancelSessionMock).toHaveBeenCalledWith("carrier-1");
    expect(failSessionMock).not.toHaveBeenCalled();
    expect(updateCallsFor("approval")[0].set).toEqual(
      expect.objectContaining({ status: "rejected", decidedBy: "owner-1" }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          action: "local_mcp_arm_denied",
          reason: "not on this machine",
        }),
      }),
    );
  });
});

describe("resolveOpenLocalMcpArmRequests", () => {
  it("direct arm resolves open requests as approved and completes carriers", async () => {
    state.joinedRows = [
      {
        request: {
          id: "req-1",
          sessionId: "carrier-1",
          status: "pending",
          payload: armPayload,
        },
      },
    ];

    const resolved = await resolveOpenLocalMcpArmRequests("srv-1", "owner-1", {
      decidedBy: "owner-1",
    });

    expect(resolved).toEqual(["req-1"]);
    const approvalUpdates = updateCallsFor("approval");
    expect(approvalUpdates).toHaveLength(1);
    expect(approvalUpdates[0].set).toEqual(
      expect.objectContaining({
        status: "approved",
        decidedBy: "owner-1",
        decidedAt: expect.any(Date),
      }),
    );
    expect(completeSessionMock).toHaveBeenCalledWith("carrier-1");
  });

  it("no open requests → no updates", async () => {
    state.joinedRows = [];
    const resolved = await resolveOpenLocalMcpArmRequests("srv-1", "owner-1", {
      decidedBy: "owner-1",
    });
    expect(resolved).toEqual([]);
    expect(state.updateCalls).toHaveLength(0);
    expect(completeSessionMock).not.toHaveBeenCalled();
  });
});
