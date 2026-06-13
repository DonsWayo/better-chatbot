import "server-only";

import { createSession } from "lib/agent-platform/sessions";
import { runSessionByIdDetached } from "lib/agent-platform/worker";
import { checkBudget } from "lib/ai/budget";
import { type ApiPrincipal } from "lib/auth/api-key-auth";
import { workflowRepository } from "lib/db/repository";
import logger from "logger";

// The governed run path for the public /api/v1/sessions endpoint. It MIRRORS
// the enforcement of src/app/api/workflow/[id]/execute/route.ts and the
// detached worker (runClaimedSession):
//   • checkAccess — the principal's user must still be able to USE the workflow
//   • checkBudget — the key's team budget must not be exhausted (→ 402)
//   • the actual run carries agentSessionId, the team + effective model
//     allow-list, and guardrails (all resolved inside runClaimedSession from
//     the session's userId/teamId), so the run is budget-attributed,
//     model-confined, guardrail-scanned, and parks on approval nodes.
//
// API keys are EXEMPT from the interactive AUP modal gate by design (no human
// at the keyboard); every other control above still applies.

export type RunSessionResult =
  | { ok: true; sessionId: string; status: string }
  | {
      ok: false;
      code: "not_found" | "forbidden" | "budget_exhausted" | "invalid_request";
      message: string;
    };

export interface RunWorkflowSessionInput {
  principal: ApiPrincipal;
  workflowId: string;
  input: unknown;
}

/**
 * Create + kick a governed workflow session for an API principal. The session
 * is created `queued`, then a detached run is fired (fire-and-forget) so the
 * HTTP handler can return 202 immediately. The existing cron worker is the
 * fallback claimant if the inline kick can't take the row.
 */
export async function runWorkflowSession(
  input: RunWorkflowSessionInput,
): Promise<RunSessionResult> {
  const { principal, workflowId } = input;

  // Ownership / visibility: the principal's user must be able to USE (read) the
  // workflow — same call the execute route makes. checkAccess returns false for
  // a missing workflow too, so a 404-vs-403 distinction is drawn by a follow-up
  // existence probe only on the deny path.
  const hasAccess = await workflowRepository
    .checkAccess(workflowId, principal.userId, true)
    .catch(() => false);
  if (!hasAccess) {
    const exists = await workflowRepository
      .selectById(workflowId)
      .then((w) => Boolean(w))
      .catch(() => false);
    return exists
      ? {
          ok: false,
          code: "forbidden",
          message: "Not allowed to run this workflow",
        }
      : { ok: false, code: "not_found", message: "Workflow not found" };
  }

  // Budget gate (ADR-0003) — 402 on an exhausted team budget, exactly like the
  // execute route. Scoped to the key's team.
  const budget = await checkBudget(principal.userId, principal.teamId);
  if (!budget.allowed) {
    return {
      ok: false,
      code: "budget_exhausted",
      message: budget.reason ?? "Team budget exhausted",
    };
  }

  const session = await createSession({
    kind: "workflow",
    definitionId: workflowId,
    userId: principal.userId,
    teamId: principal.teamId,
    originSurface: "api",
    inputPayload: input.input ?? {},
  });

  // Fire-and-forget: the run executes detached so the response returns 202 with
  // the session id. runSessionByIdDetached resolves the team + effective model
  // allow-list + guardrails from the session and parks on approval nodes.
  void runSessionByIdDetached(session.id).catch((error) => {
    logger.error(`api/v1 detached run kick failed for ${session.id}:`, error);
  });

  return { ok: true, sessionId: session.id, status: "queued" };
}
