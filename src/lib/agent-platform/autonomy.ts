import "server-only";

import { eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeOrgSettingsTable } from "lib/db/pg/schema.pg";

// ---------------------------------------------------------------------------
// Autonomy caps, layered like model entitlements (lib/admin/model-policy.ts).
//
// Layer 1 — org default cap (asafe_org_settings, key "org_autonomy_cap"):
//   absent → "interactive" (the floor; everyone can always run interactive).
//
// Layer 2 — per-team grant  (key "team_autonomy_cap:<teamId>")
// Layer 3 — per-user grant  (key "user_autonomy_cap:<userId>")
//
// All values stored as { cap: AutonomyMode } jsonb. Semantics: grants RAISE —
// the effective cap is the HIGHEST mode granted by any layer that applies,
// never below "interactive". A requested mode is then clamped to the cap
// with clampMode().
// ---------------------------------------------------------------------------

export type AutonomyMode = "interactive" | "plan" | "autopilot";

/** interactive < plan < autopilot */
export const AUTONOMY_ORDER: Record<AutonomyMode, number> = {
  interactive: 0,
  plan: 1,
  autopilot: 2,
};

export const DEFAULT_AUTONOMY_CAP: AutonomyMode = "interactive";

export const ORG_AUTONOMY_CAP_KEY = "org_autonomy_cap";

export function teamAutonomyCapKey(teamId: string): string {
  return `team_autonomy_cap:${teamId}`;
}

export function userAutonomyCapKey(userId: string): string {
  return `user_autonomy_cap:${userId}`;
}

export function isAutonomyMode(value: unknown): value is AutonomyMode {
  return value === "interactive" || value === "plan" || value === "autopilot";
}

/**
 * Pure layering: effective cap = max(org, team, user), where a missing org
 * layer falls back to the "interactive" default and missing team/user layers
 * simply don't participate. Grants raise, they never lower below the org cap.
 */
export function resolveAutonomy(
  org: AutonomyMode | null | undefined,
  team?: AutonomyMode | null,
  user?: AutonomyMode | null,
): AutonomyMode {
  let effective: AutonomyMode = org ?? DEFAULT_AUTONOMY_CAP;
  for (const layer of [team, user]) {
    if (layer && AUTONOMY_ORDER[layer] > AUTONOMY_ORDER[effective]) {
      effective = layer;
    }
  }
  return effective;
}

/** Clamp a requested mode to the effective cap: min(requested, cap). */
export function clampMode(
  requested: AutonomyMode,
  cap: AutonomyMode,
): AutonomyMode {
  return AUTONOMY_ORDER[requested] <= AUTONOMY_ORDER[cap] ? requested : cap;
}

/**
 * Read one { cap } entry from the org settings store.
 * Returns null when absent, malformed, or unreadable (fail closed — the
 * resolver then falls back to the org default / lower layers).
 */
async function readCap(key: string): Promise<AutonomyMode | null> {
  try {
    const [row] = await db
      .select({ value: AsafeOrgSettingsTable.value })
      .from(AsafeOrgSettingsTable)
      .where(eq(AsafeOrgSettingsTable.key, key))
      .limit(1);
    const value = row?.value;
    if (typeof value === "object" && value !== null && "cap" in value) {
      const cap = (value as { cap?: unknown }).cap;
      if (isAutonomyMode(cap)) return cap;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCap(key: string, cap: AutonomyMode | null): Promise<void> {
  const value = cap === null ? null : { cap };
  const updatedAt = new Date();
  await db
    .insert(AsafeOrgSettingsTable)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: AsafeOrgSettingsTable.key,
      set: { value, updatedAt },
    });
}

/** Org-wide default cap; "interactive" when unset. */
export async function getOrgAutonomyCap(): Promise<AutonomyMode> {
  return (await readCap(ORG_AUTONOMY_CAP_KEY)) ?? DEFAULT_AUTONOMY_CAP;
}

/** Set (or clear with `null`) the org-wide default cap. */
export async function setOrgAutonomyCap(
  cap: AutonomyMode | null,
): Promise<void> {
  await writeCap(ORG_AUTONOMY_CAP_KEY, cap);
}

/** Set (or clear with `null`) a team's autonomy grant. */
export async function setTeamAutonomyCap(
  teamId: string,
  cap: AutonomyMode | null,
): Promise<void> {
  await writeCap(teamAutonomyCapKey(teamId), cap);
}

/** Set (or clear with `null`) a user's autonomy grant. */
export async function setUserAutonomyCap(
  userId: string,
  cap: AutonomyMode | null,
): Promise<void> {
  await writeCap(userAutonomyCapKey(userId), cap);
}

/**
 * Effective autonomy cap for a user (optionally in a team context):
 * max(org default, team grant, user grant). Never below "interactive".
 */
export async function resolveAutonomyCap(input: {
  userId: string;
  teamId?: string | null;
}): Promise<AutonomyMode> {
  const [org, team, user] = await Promise.all([
    readCap(ORG_AUTONOMY_CAP_KEY),
    input.teamId
      ? readCap(teamAutonomyCapKey(input.teamId))
      : Promise.resolve(null),
    readCap(userAutonomyCapKey(input.userId)),
  ]);
  return resolveAutonomy(org, team, user);
}
