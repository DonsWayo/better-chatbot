import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeAupAcceptanceTable } from "@/lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";

/** Current AUP version. Bump this string to force re-acceptance after policy updates. */
export const CURRENT_AUP_VERSION = "1.0";

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

/** Record AUP acceptance for a user and invalidate the cache. */
export async function recordAupAcceptance(userId: string): Promise<void> {
  await db
    .insert(AsafeAupAcceptanceTable)
    .values({ userId, aupVersion: CURRENT_AUP_VERSION })
    .onConflictDoNothing();
  _cache.delete(userId);
}
