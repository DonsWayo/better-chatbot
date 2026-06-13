import { apiError, apiOk, requirePrincipal } from "../_lib/respond";
import { runWorkflowSession } from "../_lib/run-session";

export const dynamic = "force-dynamic";

// POST /api/v1/sessions — create + run a governed session.
//
// Body: { workflowId, input } (workflow runs are the runnable session kind).
// The session is created and EXECUTED DETACHED through the same governed path
// the execute route / worker use (checkAccess, team + effective model
// allow-list, checkBudget → 402, executor with agentSessionId, guardrails,
// recordUsage). We return 202 with the session id; the client polls
// /api/v1/sessions/[id] or streams /api/v1/sessions/[id]/stream. A run that
// hits an approval node PARKS (status awaiting_approval), it does not error.
//
// `agentId` is accepted but rejected with 400: agents execute interactively in
// chat (a conversational session is recorded there), not as a detached
// programmatic run. Use a workflow to drive an agent programmatically.
export async function POST(request: Request) {
  const auth = await requirePrincipal(request, "sessions:write");
  if (auth instanceof Response) return auth;

  let body: { workflowId?: string; agentId?: string; input?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON");
  }

  if (body.agentId && !body.workflowId) {
    return apiError(
      "invalid_request",
      "Agent runs are not supported through the programmatic API. Pass a `workflowId` to run a governed workflow session.",
    );
  }

  if (!body.workflowId || typeof body.workflowId !== "string") {
    return apiError("invalid_request", "`workflowId` is required");
  }

  const result = await runWorkflowSession({
    principal: auth,
    workflowId: body.workflowId,
    input: body.input,
  });

  if (!result.ok) {
    return apiError(result.code, result.message);
  }

  // 202 Accepted: the run executes detached; poll/stream for the terminal state.
  return apiOk({ sessionId: result.sessionId, status: result.status }, 202);
}
