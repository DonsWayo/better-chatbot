import "server-only";

import { AsafeAupAcceptanceTable, UserTable } from "@/lib/db/pg/schema.pg";
import { and, eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
// Re-exported from a server-only-free module so non-Next contexts (seed/tests)
// can import the version without dragging in this server-only file.
import { CURRENT_AUP_VERSION } from "./aup-version";

export { CURRENT_AUP_VERSION };

interface AupCacheEntry {
  accepted: boolean;
  expiresAt: number;
}

const _cache = new Map<string, AupCacheEntry>();
const AUP_CACHE_TTL_MS = 60_000;

/** Returns true if the user has accepted the current AUP version. Cached for 60s. */
export async function hasAcceptedAup(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.accepted;

  try {
    const [row] = await db
      .select({ id: AsafeAupAcceptanceTable.id })
      .from(AsafeAupAcceptanceTable)
      .where(
        and(
          eq(AsafeAupAcceptanceTable.userId, userId),
          eq(AsafeAupAcceptanceTable.aupVersion, CURRENT_AUP_VERSION),
        ),
      )
      .limit(1);

    const accepted = !!row;
    _cache.set(userId, { accepted, expiresAt: now + AUP_CACHE_TTL_MS });
    return accepted;
  } catch {
    // Fail open — never block access because of an AUP DB error
    return true;
  }
}

/**
 * Hard-gate helper for expensive/action API surfaces (chat, temporary chat,
 * workflow execution, realtime voice). Returns a clean machine-readable 403
 * when the caller has NOT accepted the current AUP version, else `null` (proceed).
 *
 * Mirrors the central, fail-safe style of the banned-user backstop in
 * auth-instance.getSession: enforcement lives in one place and every gated
 * handler calls it. `hasAcceptedAup` fails OPEN on a DB error (never blocks
 * access because of an AUP store outage), so this gate inherits that posture.
 *
 * The body uses the `aup_required` code the client maps to surfacing the AUP
 * flow (see components/chat-bot onError → AupModal). Read-only/settings/auth
 * routes and the AUP-accept route itself must NOT call this.
 */
export async function aupGateResponse(
  userId: string,
): Promise<Response | null> {
  const accepted = await hasAcceptedAup(userId);
  if (accepted) return null;
  return Response.json(
    {
      error: "aup_required",
      message: "Please accept the Acceptable Use Policy to continue.",
    },
    { status: 403 },
  );
}

/** Record AUP acceptance for a user and invalidate the cache. */
export async function recordAupAcceptance(userId: string): Promise<void> {
  // Two stores exist on purpose (versioned acceptance history + the fast
  // user.accepted_aup_at column the modal/tour gates read) — every write
  // path MUST fill both, or seeded/auxiliary acceptances don't suppress
  // the modal (found by e2e review).
  await db
    .insert(AsafeAupAcceptanceTable)
    .values({ userId, aupVersion: CURRENT_AUP_VERSION })
    .onConflictDoNothing();
  await db
    .update(UserTable)
    .set({ acceptedAupAt: new Date() })
    .where(eq(UserTable.id, userId));
  _cache.delete(userId);
}
