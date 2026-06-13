"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import { getUserPrimaryTeamId } from "lib/admin/teams";
import {
  type PendingApproval,
  canDecide,
  decideApproval,
  getApprovalWithSession,
} from "lib/agent-platform/approvals";
import {
  type AutonomyMode,
  resolveAutonomyCap,
} from "lib/agent-platform/autonomy";
import type { ApprovalRequestEntity } from "lib/db/pg/schema.pg";

// Agent Platform #24 — approval decisions + autonomy resolution.
// Internal-UI mutations → Server Actions only (docs/CLAUDE.md rule); the
// actual logic lives in lib/agent-platform/{approvals,autonomy}.ts.

async function requireDecidableRequest(id: string): Promise<{
  userId: string;
  found: PendingApproval;
}> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const isAdmin = session.user.role === "admin";

  const found = await getApprovalWithSession(id);
  if (!found) throw new Error("Approval request not found");

  const allowed = await canDecide(session.user.id, isAdmin, {
    requestedRole: found.request.requestedRole,
    sessionUserId: found.session.userId,
    sessionTeamId: found.session.teamId,
  });
  if (!allowed) throw new Error("Forbidden");

  return { userId: session.user.id, found };
}

// approve/reject return a structured {@link ActionResult} rather than throwing:
// production Next.js masks errors thrown from a Server Action into an opaque
// 500 ("digest"), so the gate reasons ("Unauthorized", "Approval request not
// found", "Forbidden", "Already decided") would never reach the decision
// buttons' toast. The auth/lookup LOGIC is unchanged — only the delivery moves
// from throw to a returned result.

export async function approveRequestAction(
  id: string,
  reason?: string,
): Promise<ActionResult<ApprovalRequestEntity>> {
  return toActionResult(async () => {
    const { userId } = await requireDecidableRequest(id);
    return decideApproval(id, { decidedBy: userId, approve: true, reason });
  });
}

export async function rejectRequestAction(
  id: string,
  reason: string,
): Promise<ActionResult<ApprovalRequestEntity>> {
  return toActionResult(async () => {
    const { userId } = await requireDecidableRequest(id);
    return decideApproval(id, { decidedBy: userId, approve: false, reason });
  });
}

/** The caller's effective autonomy cap (org → team → user layering). */
export async function resolveMyAutonomyAction(): Promise<AutonomyMode> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const teamId = await getUserPrimaryTeamId(session.user.id);
  return resolveAutonomyCap({ userId: session.user.id, teamId });
}
