import "server-only";

import { getUserPrimaryTeamId } from "lib/admin/teams";
import {
  FULL_SCOPE,
  findByPlaintext,
} from "lib/db/pg/repositories/api-key-repository.pg";
import { userRepository } from "lib/db/repository";

// Public API-key authentication for the /api/v1 surface.
//
// A presented `Authorization: Bearer ck_live_...` token is hashed and looked
// up; on a valid (non-revoked, non-expired) match we resolve a principal that
// ACTS AS the key's creating user for all downstream governance:
//   • entitlement (effective model allow-list) — the creator's
//   • budget (checkBudget / recordUsage) — the key's team (or the creator's
//     primary team)
//   • ownership / visibility (checkAccess) — the creator's user id
//
// AUP NOTE: API keys are EXEMPT from the interactive AUP modal gate
// (aupGateResponse). They are programmatic credentials issued by an
// accountable admin who accepted the AUP on the org's behalf; there is no
// human at the keyboard to show a modal to. Every OTHER control still applies:
// budget (402 on exhaustion), model allow-list, guardrails, per-tool policy,
// and ownership/visibility checks are enforced exactly as for a cookie
// session.

export interface ApiPrincipal {
  /** The user the key acts as (its createdBy). */
  userId: string;
  /** The team scope the key runs as (key.teamId ?? user's primary team). */
  teamId: string | null;
  /** The acting user's role ("admin" | "editor" | "user" | ...). */
  role: string;
  /** The api_key row id (for audit / last-used attribution). */
  keyId: string;
  /** Capability scopes granted to the key (["*"] = full). */
  scopes: string[];
}

/** Pull the raw `ck_live_...` secret out of an Authorization header. */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Authenticate an API request. Returns a principal on a valid Bearer key, or
 * null on a missing/invalid/revoked/expired key (the caller turns null into a
 * 401). Resolution failures for role/team degrade gracefully so a transient DB
 * hiccup downgrades scope rather than 500-ing.
 */
export async function authenticateApiKey(
  request: Request,
): Promise<ApiPrincipal | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const key = await findByPlaintext(token);
  if (!key) return null;

  // Resolve the acting user's role (defaults to "user" — least privilege).
  let role = "user";
  try {
    const user = await userRepository.getUserById(key.createdBy);
    if (user?.role) role = user.role;
  } catch {
    // keep least-privilege default
  }

  // The team the key runs as: an explicit key.teamId pins the scope; otherwise
  // fall back to the creator's primary team (matches the cookie-session seam).
  let teamId = key.teamId ?? null;
  if (!teamId) {
    try {
      teamId = await getUserPrimaryTeamId(key.createdBy);
    } catch {
      teamId = null;
    }
  }

  return {
    userId: key.createdBy,
    teamId,
    role,
    keyId: key.id,
    scopes: key.scopes?.length ? key.scopes : [FULL_SCOPE],
  };
}

/** Does the principal hold a given scope (full-scope "*" satisfies any)? */
export function hasScope(principal: ApiPrincipal, scope: string): boolean {
  return (
    principal.scopes.includes(FULL_SCOPE) || principal.scopes.includes(scope)
  );
}

/**
 * Role-based capability for a principal, mirroring lib/auth/permissions.ts but
 * driven by the principal's resolved role rather than a cookie session. "user"
 * role cannot create resources; "editor"/"admin" can.
 */
export function principalCanCreateAgent(principal: ApiPrincipal): boolean {
  return principal.role === "admin" || principal.role === "editor";
}
