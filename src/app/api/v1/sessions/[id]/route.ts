import { apiError, apiOk, requirePrincipal } from "../../_lib/respond";
import { loadOwnedSession } from "../../_lib/session-access";

export const dynamic = "force-dynamic";

// GET /api/v1/sessions/[id] — session status snapshot, ownership-scoped.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal(request, "sessions:read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const access = await loadOwnedSession(auth, id);
  if (!access.ok) return apiError("not_found", "Session not found");

  const s = access.session;
  return apiOk({
    sessionId: s.id,
    status: s.status,
    costSoFar: s.costSoFar,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    error: s.error,
  });
}
