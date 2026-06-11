import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { writeAuditLog } from "lib/compliance/audit";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type AgentSessionEntity,
  AgentSessionTable,
  type ApprovalRequestEntity,
  ApprovalRequestTable,
  AsafeTeamMemberTable,
} from "lib/db/pg/schema.pg";
import {
  cancelSession,
  completeSession,
  createSession,
  failSession,
} from "./sessions";

export { ApprovalPendingError, isApprovalPending } from "./approval-error";

// Agent Platform #24 — human approval gate (docs/design/agent-platform.md).
// An approval node parks its session: a pending approval_request row is
// written, the session flips to awaiting_approval and the worker is released.
// A decision (Server Action) either re-queues the session for any worker to
// resume from checkpoint (approve) or fails it (reject).
//
// NOTE: sessions.ts (owned elsewhere) exposes no awaiting_approval/re-queue
// transition, so those two status flips are done with direct AgentSessionTable
// updates here; the reject path reuses sessions.failSession.

export type ApprovalRequestedRole = "owner" | "team-admin" | "admin";

export interface CreateApprovalRequestInput {
  sessionId: string;
  stepIndex: number;
  /** What the approver sees: numbered plan, diff, payload summary. */
  payload?: unknown;
  requestedRole?: ApprovalRequestedRole;
}

export interface DecideApprovalInput {
  decidedBy: string;
  approve: boolean;
  reason?: string;
}

export interface PendingApproval {
  request: ApprovalRequestEntity;
  session: AgentSessionEntity;
}

/**
 * Insert a pending approval request and park the session
 * (status → awaiting_approval).
 */
export async function createApprovalRequest(
  input: CreateApprovalRequestInput,
): Promise<ApprovalRequestEntity> {
  const [request] = await db
    .insert(ApprovalRequestTable)
    .values({
      sessionId: input.sessionId,
      stepIndex: input.stepIndex,
      payload: input.payload ?? null,
      requestedRole: input.requestedRole ?? "team-admin",
    })
    .returning();
  await markSessionAwaitingApproval(input.sessionId);
  return request;
}

/**
 * Flip a session to awaiting_approval. Exported separately so the execute
 * route (and later the detached worker) can re-assert the parked state after
 * the generic WORKFLOW_END fail path races the ApprovalPendingError throw.
 */
export async function markSessionAwaitingApproval(
  sessionId: string,
): Promise<void> {
  await db
    .update(AgentSessionTable)
    .set({
      status: "awaiting_approval",
      error: null,
      endedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(AgentSessionTable.id, sessionId));
}

// ── Local-MCP consent v2 (ADR-0010) — per-approval grants ────────────────────
// approval_request has no `kind` column and a NOT NULL session FK, so this
// kind is encoded in the jsonb payload and rides on a "carrier" agent_session
// (kind "conversational", definitionId = the MCP server id — that column is
// deliberately polymorphic / FK-less). Carrier sessions are never executed:
// the worker claim query only takes kind = 'workflow', and decisions below
// complete/cancel the carrier instead of re-queueing it.

export const LOCAL_MCP_ARM_KIND = "local_mcp_arm";

export interface LocalMcpArmPayload {
  kind: typeof LOCAL_MCP_ARM_KIND;
  serverId: string;
  serverName: string;
  /** The tool whose invocation triggered the request. */
  toolName: string;
  /** The server owner — the accountable identity for a local process. */
  requestedBy: string;
  /** Human-readable fallback for generic approval renderers. */
  message: string;
}

export function isLocalMcpArmPayload(
  payload: unknown,
): payload is LocalMcpArmPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === LOCAL_MCP_ARM_KIND &&
    typeof (payload as { serverId?: unknown }).serverId === "string"
  );
}

export interface CreateLocalMcpArmRequestInput {
  serverId: string;
  serverName: string;
  toolName: string;
  /** Owner the request is targeted at (requestedRole "owner"). */
  userId: string;
  teamId?: string | null;
}

/** Open (pending) local-MCP arm requests for a (server, user), newest first. */
export async function listOpenLocalMcpArmRequests(
  serverId: string,
  userId: string,
): Promise<ApprovalRequestEntity[]> {
  const rows = await db
    .select({ request: ApprovalRequestTable })
    .from(ApprovalRequestTable)
    .innerJoin(
      AgentSessionTable,
      eq(ApprovalRequestTable.sessionId, AgentSessionTable.id),
    )
    .where(
      and(
        eq(ApprovalRequestTable.status, "pending"),
        eq(AgentSessionTable.definitionId, serverId),
        eq(AgentSessionTable.userId, userId),
      ),
    )
    .orderBy(desc(ApprovalRequestTable.requestedAt));
  return rows
    .map((row) => row.request)
    .filter((request) => isLocalMcpArmPayload(request.payload));
}

/** The single open local-MCP arm request for a (server, user), or null. */
export async function findOpenLocalMcpArmRequest(
  serverId: string,
  userId: string,
): Promise<ApprovalRequestEntity | null> {
  const open = await listOpenLocalMcpArmRequests(serverId, userId);
  return open[0] ?? null;
}

/**
 * File an owner-targeted "allow local tools" approval request for an unarmed
 * local (stdio) server. Deduped: at most one open request per (server, user)
 * — a still-pending request is returned as-is (`deduped: true`).
 * Request creation is audit-logged.
 */
export async function createLocalMcpArmRequest(
  input: CreateLocalMcpArmRequestInput,
): Promise<{ request: ApprovalRequestEntity; deduped: boolean }> {
  const existing = await findOpenLocalMcpArmRequest(
    input.serverId,
    input.userId,
  );
  if (existing) return { request: existing, deduped: true };

  const carrier = await createSession({
    kind: "conversational",
    definitionId: input.serverId,
    userId: input.userId,
    teamId: input.teamId ?? null,
    originSurface: "desktop",
    inputPayload: { kind: LOCAL_MCP_ARM_KIND, serverId: input.serverId },
  });

  const payload: LocalMcpArmPayload = {
    kind: LOCAL_MCP_ARM_KIND,
    serverId: input.serverId,
    serverName: input.serverName,
    toolName: input.toolName,
    requestedBy: input.userId,
    message: `Allow local (stdio) tools for connector "${input.serverName}" — the model attempted to call "${input.toolName}".`,
  };

  const request = await createApprovalRequest({
    sessionId: carrier.id,
    stepIndex: 0,
    payload,
    requestedRole: "owner",
  });

  void writeAuditLog({
    userId: input.userId,
    teamId: input.teamId ?? null,
    eventType: "admin_action",
    details: {
      action: "local_mcp_arm_requested",
      serverId: input.serverId,
      serverName: input.serverName,
      toolName: input.toolName,
      requestId: request.id,
    },
  });

  return { request, deduped: false };
}

/**
 * Direct-arm path (v1 button on the connector page): the owner already
 * granted consent, so any open arm request for this (server, user) is
 * resolved as approved — the Inbox must not keep showing stale requests.
 * Returns the resolved request ids.
 */
export async function resolveOpenLocalMcpArmRequests(
  serverId: string,
  userId: string,
  opts: { decidedBy: string; reason?: string },
): Promise<string[]> {
  const open = await listOpenLocalMcpArmRequests(serverId, userId);
  const now = new Date();
  const resolvedIds: string[] = [];
  for (const request of open) {
    await db
      .update(ApprovalRequestTable)
      .set({
        status: "approved",
        decidedBy: opts.decidedBy,
        decidedAt: now,
        reason: opts.reason ?? "Granted directly from the connector page",
      })
      .where(
        and(
          eq(ApprovalRequestTable.id, request.id),
          eq(ApprovalRequestTable.status, "pending"),
        ),
      );
    await completeSession(request.sessionId);
    resolvedIds.push(request.id);
  }
  return resolvedIds;
}

/**
 * Settle a decided local-MCP arm request: approve arms the server in the MCP
 * manager (default 8h TTL, grantedBy recorded) and completes the carrier
 * session; deny cancels the carrier. Both outcomes are audit-logged.
 */
async function settleLocalMcpArmDecision(
  request: ApprovalRequestEntity,
  payload: LocalMcpArmPayload,
  input: DecideApprovalInput,
): Promise<void> {
  if (input.approve) {
    // Lazy import: keeps the MCP client stack out of this module's static
    // graph. Arming is in-process — the same Node process serves Server
    // Actions and the MCP clients manager (EKS/desktop, no serverless).
    const { mcpClientsManager } = await import("lib/ai/mcp/mcp-manager");
    const armedUntil = mcpClientsManager.armLocalServer(payload.serverId, {
      grantedBy: input.decidedBy,
    });
    await completeSession(request.sessionId);
    void writeAuditLog({
      userId: input.decidedBy,
      eventType: "admin_action",
      details: {
        action: "local_mcp_arm_approved",
        serverId: payload.serverId,
        serverName: payload.serverName,
        toolName: payload.toolName,
        requestId: request.id,
        requestedBy: payload.requestedBy,
        armedUntil,
      },
    });
  } else {
    await cancelSession(request.sessionId);
    void writeAuditLog({
      userId: input.decidedBy,
      eventType: "admin_action",
      details: {
        action: "local_mcp_arm_denied",
        serverId: payload.serverId,
        serverName: payload.serverName,
        toolName: payload.toolName,
        requestId: request.id,
        requestedBy: payload.requestedBy,
        reason: input.reason ?? null,
      },
    });
  }
}

/**
 * Decide a pending request. Approve → session re-queued (status `queued`) so
 * any worker can pick it up and resume from checkpoint. Reject → session
 * failed with "Rejected: <reason>". Throws "Already decided" on a second
 * decision. Local-MCP arm requests (payload kind "local_mcp_arm") settle
 * differently: approve arms the server in the MCP manager and completes the
 * carrier session; reject cancels it — never re-queued, never failed.
 */
export async function decideApproval(
  id: string,
  input: DecideApprovalInput,
): Promise<ApprovalRequestEntity> {
  const [request] = await db
    .select()
    .from(ApprovalRequestTable)
    .where(eq(ApprovalRequestTable.id, id))
    .limit(1);
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("Already decided");

  const now = new Date();
  const [updated] = await db
    .update(ApprovalRequestTable)
    .set({
      status: input.approve ? "approved" : "rejected",
      decidedBy: input.decidedBy,
      decidedAt: now,
      reason: input.reason ?? null,
    })
    .where(eq(ApprovalRequestTable.id, id))
    .returning();

  if (isLocalMcpArmPayload(request.payload)) {
    await settleLocalMcpArmDecision(request, request.payload, input);
    return updated;
  }

  if (input.approve) {
    // Re-queue for a worker: clears the parked state so the SKIP LOCKED
    // claim loop (or a re-run) resumes the session from its checkpoints.
    await db
      .update(AgentSessionTable)
      .set({ status: "queued", error: null, endedAt: null, updatedAt: now })
      .where(eq(AgentSessionTable.id, request.sessionId));
  } else {
    await failSession(
      request.sessionId,
      `Rejected: ${input.reason ?? "no reason given"}`,
    );
  }

  return updated;
}

/** The slice of an approval request + its session that permissions need. */
export interface ApprovalDecisionContext {
  requestedRole: ApprovalRequestedRole;
  sessionUserId: string;
  sessionTeamId: string | null;
}

/**
 * May `userId` decide this request?
 * - Global admins decide anything.
 * - requestedRole "owner"      → only the session owner.
 * - requestedRole "team-admin" → admins of the session's team.
 * - requestedRole "admin"      → only global admins.
 */
export async function canDecide(
  userId: string,
  isAdmin: boolean,
  request: ApprovalDecisionContext,
): Promise<boolean> {
  if (isAdmin) return true;
  switch (request.requestedRole) {
    case "owner":
      return request.sessionUserId === userId;
    case "team-admin": {
      if (!request.sessionTeamId) return false;
      return isTeamAdmin(userId, request.sessionTeamId);
    }
    case "admin":
      return false;
    default:
      return false;
  }
}

async function isTeamAdmin(userId: string, teamId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: AsafeTeamMemberTable.id })
      .from(AsafeTeamMemberTable)
      .where(
        and(
          eq(AsafeTeamMemberTable.teamId, teamId),
          eq(AsafeTeamMemberTable.userId, userId),
          eq(AsafeTeamMemberTable.role, "admin"),
        ),
      )
      .limit(1);
    return Boolean(row);
  } catch {
    // Fail closed: a broken membership lookup must not grant decisions.
    return false;
  }
}

async function listAdminTeamIds(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ teamId: AsafeTeamMemberTable.teamId })
      .from(AsafeTeamMemberTable)
      .where(
        and(
          eq(AsafeTeamMemberTable.userId, userId),
          eq(AsafeTeamMemberTable.role, "admin"),
        ),
      );
    return rows.map((r) => r.teamId);
  } catch {
    return [];
  }
}

/**
 * Pending requests `userId` is allowed to decide, newest first.
 * Global admins see every pending request; everyone else sees
 * owner-gated requests on their own sessions plus team-admin-gated
 * requests on sessions of teams they administer.
 */
export async function listPendingApprovalsForUser(
  userId: string,
  isAdmin: boolean,
): Promise<PendingApproval[]> {
  const pending = eq(ApprovalRequestTable.status, "pending");

  let where = pending;
  if (!isAdmin) {
    const adminTeamIds = await listAdminTeamIds(userId);
    const ownerGate = and(
      eq(ApprovalRequestTable.requestedRole, "owner"),
      eq(AgentSessionTable.userId, userId),
    );
    const scope =
      adminTeamIds.length > 0
        ? or(
            ownerGate,
            and(
              eq(ApprovalRequestTable.requestedRole, "team-admin"),
              inArray(AgentSessionTable.teamId, adminTeamIds),
            ),
          )
        : ownerGate;
    where = and(pending, scope)!;
  }

  return db
    .select({ request: ApprovalRequestTable, session: AgentSessionTable })
    .from(ApprovalRequestTable)
    .innerJoin(
      AgentSessionTable,
      eq(ApprovalRequestTable.sessionId, AgentSessionTable.id),
    )
    .where(where)
    .orderBy(desc(ApprovalRequestTable.requestedAt));
}

/** Latest approval request for a session (any status), or null. */
export async function getApprovalForSession(
  sessionId: string,
): Promise<ApprovalRequestEntity | null> {
  const [request] = await db
    .select()
    .from(ApprovalRequestTable)
    .where(eq(ApprovalRequestTable.sessionId, sessionId))
    .orderBy(desc(ApprovalRequestTable.requestedAt))
    .limit(1);
  return request ?? null;
}

/** One request joined with its session — input for canDecide in actions. */
export async function getApprovalWithSession(
  id: string,
): Promise<PendingApproval | null> {
  const [row] = await db
    .select({ request: ApprovalRequestTable, session: AgentSessionTable })
    .from(ApprovalRequestTable)
    .innerJoin(
      AgentSessionTable,
      eq(ApprovalRequestTable.sessionId, AgentSessionTable.id),
    )
    .where(eq(ApprovalRequestTable.id, id))
    .limit(1);
  return row ?? null;
}
