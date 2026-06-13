import "server-only";

import { getSession } from "lib/agent-platform/sessions";
import { type ApiPrincipal } from "lib/auth/api-key-auth";
import { type AgentSessionEntity } from "lib/db/pg/schema.pg";

// Ownership scoping for /api/v1/sessions/[id]*: a principal may only see
// sessions it (its acting user) owns. A session created through the public API
// always has userId = principal.userId, so equality is the scope.

export type SessionAccess =
  | { ok: true; session: AgentSessionEntity }
  | { ok: false; reason: "not_found" };

/**
 * Load a session and verify the principal owns it. To avoid leaking existence,
 * a session owned by someone else returns the same `not_found` as a missing id.
 */
export async function loadOwnedSession(
  principal: ApiPrincipal,
  sessionId: string,
): Promise<SessionAccess> {
  const session = await getSession(sessionId);
  if (!session || session.userId !== principal.userId) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, session };
}
