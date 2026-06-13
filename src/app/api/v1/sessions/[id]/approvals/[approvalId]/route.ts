import {
  canDecide,
  decideApproval,
  getApprovalWithSession,
} from "lib/agent-platform/approvals";
import { apiError, apiOk, requirePrincipal } from "../../../../_lib/respond";
import { loadOwnedSession } from "../../../../_lib/session-access";

export const dynamic = "force-dynamic";

// POST /api/v1/sessions/[id]/approvals/[approvalId]
// Body: { approve: boolean, reason?: string }
// Decide a pending approval on a parked session. Approve re-queues the session
// (the worker resume seeds completed steps); reject fails it. Ownership-scoped:
// the principal must own the session AND be permitted to decide the request's
// requestedRole (owner → session owner; team-admin → team admin; admin → global
// admin). The principal's resolved role gates the admin check.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; approvalId: string }> },
) {
  const auth = await requirePrincipal(request, "sessions:write");
  if (auth instanceof Response) return auth;

  const { id, approvalId } = await params;

  const access = await loadOwnedSession(auth, id);
  if (!access.ok) return apiError("not_found", "Session not found");

  const approval = await getApprovalWithSession(approvalId);
  if (!approval || approval.session.id !== id) {
    return apiError("not_found", "Approval request not found");
  }
  if (approval.request.status !== "pending") {
    return apiError("invalid_request", "Approval already decided");
  }

  let body: { approve?: unknown; reason?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON");
  }
  if (typeof body.approve !== "boolean") {
    return apiError("invalid_request", "`approve` (boolean) is required");
  }

  // Permission to decide this request's requestedRole.
  const isAdmin = auth.role === "admin";
  const allowed = await canDecide(auth.userId, isAdmin, {
    requestedRole: approval.request.requestedRole,
    sessionUserId: approval.session.userId,
    sessionTeamId: approval.session.teamId,
  });
  if (!allowed) {
    return apiError(
      "forbidden",
      "This principal is not permitted to decide this approval request",
    );
  }

  const reason = typeof body.reason === "string" ? body.reason : undefined;
  const updated = await decideApproval(approvalId, {
    decidedBy: auth.userId,
    approve: body.approve,
    reason,
  });

  return apiOk({
    approvalId: updated.id,
    status: updated.status,
    sessionId: id,
    // On approve the session re-queues and resumes; on reject it is failed.
    sessionStatus: body.approve ? "queued" : "failed",
  });
}
