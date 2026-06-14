import "server-only";

import { eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeOrgSettingsTable, AsafeTeamTable } from "lib/db/pg/schema.pg";
import type { TeamModelPolicy } from "lib/db/pg/schema.pg";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({ message: "model-policy: " });

export type { TeamModelPolicy };

// ---------------------------------------------------------------------------
// Model entitlements, ERP price-list style.
//
// Layer 1 — org BASE allow-list (asafe_org_settings, key below):
//   null  → no restriction (all approved models)
//   array → only the listed model IDs
//
// Layer 2 — per-team override (asafe_team.model_policy jsonb):
//   { mode: "inherit", add?, remove? } → effective = base + add − remove
//   { mode: "replace", models? }       → effective = exactly `models`
//
// Backward compat: a team with a non-empty legacy model_allow_list and NO
// model_policy behaves as { mode: "replace", models: legacyList }.
//
// The resolved effective list keeps the same convention as the org base:
//   null → unrestricted; array → restricted to those IDs.
// (Consumers of TeamPolicy.modelAllowList still see [] for "unrestricted" —
// teams.ts maps null → [] to keep its contract stable.)
// ---------------------------------------------------------------------------

export const ORG_BASE_MODEL_ALLOW_LIST_KEY = "org_base_model_allow_list";

function dedupe(models: string[]): string[] {
  return Array.from(new Set(models));
}

// The org base allow-list is read on EVERY chat request (via getTeamPolicy and
// resolveTeamModelAllowList) but changes only when an admin edits the org
// catalog. Cache it in-process for a short TTL — same Map+TTL shape as the
// caches in teams.ts. Invalidated synchronously on setOrgBaseModelAllowList.
let _orgBaseAllowListCache:
  | { value: string[] | null; expiresAt: number }
  | undefined;
const ORG_BASE_ALLOW_LIST_TTL_MS = 30_000;

/**
 * Clear the in-process org-base allow-list cache. Called on write; also
 * exported so tests can force a fresh DB read between cases.
 */
export function clearOrgBaseModelAllowListCache(): void {
  _orgBaseAllowListCache = undefined;
}

/**
 * The org-wide BASE model allow-list.
 * `null` = no restriction configured (all approved models allowed).
 * Fails open (null) if the settings table is unreachable.
 * Cached in-process for 30 s (invalidated on write).
 */
export async function getOrgBaseModelAllowList(): Promise<string[] | null> {
  const now = Date.now();
  if (_orgBaseAllowListCache && _orgBaseAllowListCache.expiresAt > now) {
    return _orgBaseAllowListCache.value;
  }
  try {
    const [row] = await db
      .select({ value: AsafeOrgSettingsTable.value })
      .from(AsafeOrgSettingsTable)
      .where(eq(AsafeOrgSettingsTable.key, ORG_BASE_MODEL_ALLOW_LIST_KEY))
      .limit(1);

    const value = row?.value;
    const resolved: string[] | null = Array.isArray(value)
      ? dedupe(value.filter((v): v is string => typeof v === "string"))
      : null;
    _orgBaseAllowListCache = {
      value: resolved,
      expiresAt: now + ORG_BASE_ALLOW_LIST_TTL_MS,
    };
    return resolved;
  } catch (e) {
    // Fail open: an unreadable settings store must not lock everyone out, but
    // a broken entitlement layer must be observable. Serve last-known-good if
    // we have it (even if expired) rather than flapping to unrestricted.
    logger.error("org base model allow-list resolution failed", e);
    return _orgBaseAllowListCache?.value ?? null;
  }
}

/**
 * Set (or clear with `null`) the org-wide BASE model allow-list.
 */
export async function setOrgBaseModelAllowList(
  models: string[] | null,
): Promise<void> {
  const value = models === null ? null : dedupe(models);
  await db
    .insert(AsafeOrgSettingsTable)
    .values({
      key: ORG_BASE_MODEL_ALLOW_LIST_KEY,
      value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: AsafeOrgSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  // Invalidate the in-process cache so the new catalog applies immediately.
  clearOrgBaseModelAllowListCache();
}

/**
 * Set (or clear with `null`) a team's layered model policy override.
 * Exported so the admin UI can call it from a server action later.
 */
export async function setTeamModelPolicy(
  teamId: string,
  policy: TeamModelPolicy | null,
): Promise<void> {
  await db
    .update(AsafeTeamTable)
    .set({ modelPolicy: policy, updatedAt: new Date() })
    .where(eq(AsafeTeamTable.id, teamId));
}

/**
 * Pure composition of org base + team override → effective allow-list.
 *
 * - No override (and empty/absent legacy list) → base passes through.
 * - Legacy non-empty `model_allow_list` with no `model_policy` is treated as
 *   `{ mode: "replace", models: legacyList }`.
 * - "replace" → exactly `models` (base ignored).
 * - "inherit" → base + add − remove. With a null (unrestricted) base:
 *   adds alone become the effective list; with no adds the result stays
 *   null, since "all models minus X" cannot be enumerated.
 * - `null` result = unrestricted.
 */
export function resolveModelAllowList(
  base: string[] | null,
  policy: TeamModelPolicy | null | undefined,
  legacyAllowList?: string[] | null,
): string[] | null {
  let override: TeamModelPolicy | null = policy ?? null;
  if (!override && legacyAllowList && legacyAllowList.length > 0) {
    override = { mode: "replace", models: legacyAllowList };
  }

  if (!override) return base;

  if (override.mode === "replace") {
    return dedupe(override.models ?? []);
  }

  // mode === "inherit"
  const add = override.add ?? [];
  const remove = new Set(override.remove ?? []);

  if (base === null) {
    if (add.length === 0) return null;
    return dedupe(add.filter((m) => !remove.has(m)));
  }

  return dedupe([...base, ...add].filter((m) => !remove.has(m)));
}

/**
 * Resolve the EFFECTIVE model allow-list for a team (org base layered with
 * the team's override). `null` = unrestricted. Unknown teams fall back to the
 * org base; DB errors fail open per layer.
 */
export async function resolveTeamModelAllowList(
  teamId: string,
): Promise<string[] | null> {
  const [base, row] = await Promise.all([
    getOrgBaseModelAllowList(),
    (async () => {
      try {
        const [r] = await db
          .select({
            modelPolicy: AsafeTeamTable.modelPolicy,
            modelAllowList: AsafeTeamTable.modelAllowList,
          })
          .from(AsafeTeamTable)
          .where(eq(AsafeTeamTable.id, teamId))
          .limit(1);
        return r ?? null;
      } catch (e) {
        // Fail open per layer (the org base still applies), but log so a
        // broken team-policy read isn't silent.
        logger.error("team model policy row resolution failed", e);
        return null;
      }
    })(),
  ]);

  return resolveModelAllowList(
    base,
    row?.modelPolicy ?? null,
    row?.modelAllowList ?? null,
  );
}
