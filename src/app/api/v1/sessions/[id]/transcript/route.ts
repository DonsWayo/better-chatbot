import { getSessionWithSteps } from "lib/agent-platform/sessions";
import { apiError, apiOk, requirePrincipal } from "../../../_lib/respond";
import { loadOwnedSession } from "../../../_lib/session-access";

export const dynamic = "force-dynamic";

// GET /api/v1/sessions/[id]/transcript — ordered agent_step rows for the
// session (node_kind / status / output / cost). Ownership-scoped.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal(request, "sessions:read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const access = await loadOwnedSession(auth, id);
  if (!access.ok) return apiError("not_found", "Session not found");

  const withSteps = await getSessionWithSteps(id);
  if (!withSteps) return apiError("not_found", "Session not found");

  return apiOk({
    sessionId: id,
    status: withSteps.session.status,
    steps: withSteps.steps.map((step) => ({
      stepIndex: step.stepIndex,
      nodeId: step.nodeId,
      nodeKind: step.nodeKind,
      status: step.status,
      output: step.output,
      error: step.error,
      costUsd: step.costUsd,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
    })),
  });
}
