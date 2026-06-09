import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeUserModelGrantTable } from "@/lib/db/pg/schema.pg";
import { eq, and, or, isNull, gte } from "drizzle-orm";

export interface UserModelGrant {
  id: string;
  userId: string;
  modelId: string;
  grantedBy: string;
  expiresAt: Date | null;
  createdAt: Date;
}

// Cache grants per user for 30s (invalidated on write)
const _grantsCache = new Map<string, { models: string[]; expiresAt: number }>();
const GRANTS_CACHE_TTL_MS = 30_000;

function invalidateGrantsCache(userId: string) {
  _grantsCache.delete(userId);
}

/**
 * Returns the set of model IDs this user has been explicitly granted.
 * Expired grants are excluded. Result is cached for 30 s.
 */
export async function getUserModelGrants(userId: string): Promise<string[]> {
  const now = Date.now();
  const cached = _grantsCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.models;

  const now_ts = new Date();
  const rows = await db
    .select({ modelId: AsafeUserModelGrantTable.modelId })
    .from(AsafeUserModelGrantTable)
    .where(
      and(
        eq(AsafeUserModelGrantTable.userId, userId),
        or(isNull(AsafeUserModelGrantTable.expiresAt), gte(AsafeUserModelGrantTable.expiresAt, now_ts)),
      ),
    );

  const models = rows.map((r) => r.modelId);
  _grantsCache.set(userId, { models, expiresAt: now + GRANTS_CACHE_TTL_MS });
  return models;
}

/**
 * Grant a user access to a model. Upserts — re-granting extends or clears expiry.
 */
export async function grantUserModel(
  userId: string,
  modelId: string,
  grantedBy: string,
  expiresAt?: Date | null,
): Promise<void> {
  await db
    .insert(AsafeUserModelGrantTable)
    .values({ userId, modelId, grantedBy, expiresAt: expiresAt ?? null })
    .onConflictDoUpdate({
      target: [AsafeUserModelGrantTable.userId, AsafeUserModelGrantTable.modelId],
      set: { grantedBy, expiresAt: expiresAt ?? null },
    });
  invalidateGrantsCache(userId);
}

/**
 * Revoke a specific grant by its ID.
 */
export async function revokeUserModelGrant(grantId: string, userId: string): Promise<void> {
  await db
    .delete(AsafeUserModelGrantTable)
    .where(
      and(eq(AsafeUserModelGrantTable.id, grantId), eq(AsafeUserModelGrantTable.userId, userId)),
    );
  invalidateGrantsCache(userId);
}

/**
 * List all grants for a user (including expired), for admin display.
 */
export async function listUserModelGrants(userId: string): Promise<UserModelGrant[]> {
  return db
    .select()
    .from(AsafeUserModelGrantTable)
    .where(eq(AsafeUserModelGrantTable.userId, userId))
    .orderBy(AsafeUserModelGrantTable.createdAt);
}
