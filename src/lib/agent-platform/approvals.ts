import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  type AgentSessionEntity,
  AgentSessionTable,
  type ApprovalRequestEntity,
  ApprovalRequestTable,
  AsafeTeamMemberTable,
} from "lib/db/pg/schema.pg";
import { failSession } from "./sessions";

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

/**
 * Decide a pending request. Approve → session re-queued (status `queued`) so
 * any worker can pick it up and resume from checkpoint. Reject → session
 * failed with "Rejected: <reason>". Throws "Already decided" on a second
 * decision.
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
