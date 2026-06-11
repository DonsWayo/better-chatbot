import "server-only";

import { eq, like } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeOrgSettingsTable } from "lib/db/pg/schema.pg";

// ---------------------------------------------------------------------------
// Memory policy, layered org → team like autonomy caps
// (lib/agent-platform/autonomy.ts) and model entitlements
// (lib/admin/model-policy.ts), stored in asafe_org_settings.
//
// Keys (jsonb boolean values; absent/null = unset → fall through):
//   "memory_enabled"                          — org default, unset → TRUE
//   "memory_implicit_extraction"              — org default, unset → FALSE
//   "team_memory_enabled:<teamId>"            — team override (wins when set)
//   "team_memory_implicit_extraction:<teamId>"
//
// Defaults (docs/design/user-memory.md, Open questions): memory itself is ON
// (explicit "remember this" is the safe default-on path) but IMPLICIT
// extraction is OFF until A-SAFE legal signs off on the lawful-basis analysis
// for background extraction in an EU employment context.
//
// The user-level tri-state (on / paused / off) lives in user.preferences
// (`memoryMode`) and is resolved separately — org/team policy cascades over
// it: policy-disabled stops read+write regardless of the user setting.
// ---------------------------------------------------------------------------

export type MemoryMode = "on" | "paused" | "off";

export interface MemoryPolicy {
  enabled: boolean;
  implicitExtraction: boolean;
}

export const DEFAULT_MEMORY_POLICY: MemoryPolicy = {
  enabled: true,
  implicitExtraction: false,
};

export const ORG_MEMORY_ENABLED_KEY = "memory_enabled";
export const ORG_MEMORY_IMPLICIT_EXTRACTION_KEY = "memory_implicit_extraction";

export const TEAM_MEMORY_ENABLED_KEY_PREFIX = "team_memory_enabled:";
export const TEAM_MEMORY_IMPLICIT_EXTRACTION_KEY_PREFIX =
  "team_memory_implicit_extraction:";

export function teamMemoryEnabledKey(teamId: string): string {
  return `${TEAM_MEMORY_ENABLED_KEY_PREFIX}${teamId}`;
}

export function teamMemoryImplicitExtractionKey(teamId: string): string {
  return `${TEAM_MEMORY_IMPLICIT_EXTRACTION_KEY_PREFIX}${teamId}`;
}

export function isMemoryMode(value: unknown): value is MemoryMode {
  return value === "on" || value === "paused" || value === "off";
}

/**
 * Pure layering: team override (when set) wins over org (when set) wins over
 * the default. `null`/`undefined` layers don't participate.
 */
export function resolveMemoryLayers(
  defaults: MemoryPolicy,
  org: Partial<Record<keyof MemoryPolicy, boolean | null>>,
  team?: Partial<Record<keyof MemoryPolicy, boolean | null>>,
): MemoryPolicy {
  const pick = (key: keyof MemoryPolicy): boolean =>
    team?.[key] ?? org[key] ?? defaults[key];
  return {
    enabled: pick("enabled"),
    implicitExtraction: pick("implicitExtraction"),
  };
}

/**
 * Read one boolean entry from the org settings store. Returns null when
 * absent, malformed, or unreadable — the resolver then falls through to the
 * lower layer / default (same failure posture as the autonomy resolver).
 */
async function readBool(key: string): Promise<boolean | null> {
  try {
    const [row] = await db
      .select({ value: AsafeOrgSettingsTable.value })
      .from(AsafeOrgSettingsTable)
      .where(eq(AsafeOrgSettingsTable.key, key))
      .limit(1);
    const value = row?.value;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

async function writeBool(key: string, value: boolean | null): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(AsafeOrgSettingsTable)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({
      target: AsafeOrgSettingsTable.key,
      set: { value, updatedAt },
    });
}

/** Set (or clear with `null`) the org-wide memory kill switch. */
export async function setOrgMemoryEnabled(
  enabled: boolean | null,
): Promise<void> {
  await writeBool(ORG_MEMORY_ENABLED_KEY, enabled);
}

/** Set (or clear with `null`) the org-wide implicit-extraction toggle. */
export async function setOrgMemoryImplicitExtraction(
  enabled: boolean | null,
): Promise<void> {
  await writeBool(ORG_MEMORY_IMPLICIT_EXTRACTION_KEY, enabled);
}

/** Set (or clear with `null`) a team's memory-enabled override. */
export async function setTeamMemoryEnabled(
  teamId: string,
  enabled: boolean | null,
): Promise<void> {
  await writeBool(teamMemoryEnabledKey(teamId), enabled);
}

/** Set (or clear with `null`) a team's implicit-extraction override. */
export async function setTeamMemoryImplicitExtraction(
  teamId: string,
  enabled: boolean | null,
): Promise<void> {
  await writeBool(teamMemoryImplicitExtractionKey(teamId), enabled);
}

/** One team's stored memory overrides; `null` field = inherit (not set). */
export interface TeamMemoryOverride {
  teamId: string;
  enabled: boolean | null;
  implicitExtraction: boolean | null;
}

/**
 * All stored team memory overrides, for the admin overrides UI. Scans the two
 * team-key prefixes the same way `isLocalMcpRuntimeEnabled`
 * (lib/ai/mcp/local-policy.ts) scans its prefix. Non-boolean values (e.g.
 * cleared with `null`) mean inherit and are dropped; teams with neither field
 * set are omitted. Fails soft to `[]` — listing is a UI affordance, not an
 * enforcement path.
 */
export async function listTeamMemoryOverrides(): Promise<TeamMemoryOverride[]> {
  const scan = (prefix: string) =>
    db
      .select({
        key: AsafeOrgSettingsTable.key,
        value: AsafeOrgSettingsTable.value,
      })
      .from(AsafeOrgSettingsTable)
      .where(like(AsafeOrgSettingsTable.key, `${prefix}%`));
  try {
    const [enabledRows, implicitRows] = await Promise.all([
      scan(TEAM_MEMORY_ENABLED_KEY_PREFIX),
      scan(TEAM_MEMORY_IMPLICIT_EXTRACTION_KEY_PREFIX),
    ]);
    const byTeam = new Map<string, TeamMemoryOverride>();
    const entry = (teamId: string): TeamMemoryOverride => {
      let row = byTeam.get(teamId);
      if (!row) {
        row = { teamId, enabled: null, implicitExtraction: null };
        byTeam.set(teamId, row);
      }
      return row;
    };
    for (const row of enabledRows) {
      const teamId = row.key.slice(TEAM_MEMORY_ENABLED_KEY_PREFIX.length);
      if (!teamId || typeof row.value !== "boolean") continue;
      entry(teamId).enabled = row.value;
    }
    for (const row of implicitRows) {
      const teamId = row.key.slice(
        TEAM_MEMORY_IMPLICIT_EXTRACTION_KEY_PREFIX.length,
      );
      if (!teamId || typeof row.value !== "boolean") continue;
      entry(teamId).implicitExtraction = row.value;
    }
    return [...byTeam.values()].sort((a, b) =>
      a.teamId.localeCompare(b.teamId),
    );
  } catch {
    return [];
  }
}

/**
 * Effective memory policy for a team context (org default layered with the
 * team override). `teamId` null/undefined → org policy alone.
 */
export async function resolveMemoryPolicy(
  teamId?: string | null,
): Promise<MemoryPolicy> {
  const [orgEnabled, orgImplicit, teamEnabled, teamImplicit] =
    await Promise.all([
      readBool(ORG_MEMORY_ENABLED_KEY),
      readBool(ORG_MEMORY_IMPLICIT_EXTRACTION_KEY),
      teamId ? readBool(teamMemoryEnabledKey(teamId)) : Promise.resolve(null),
      teamId
        ? readBool(teamMemoryImplicitExtractionKey(teamId))
        : Promise.resolve(null),
    ]);
  return resolveMemoryLayers(
    DEFAULT_MEMORY_POLICY,
    { enabled: orgEnabled, implicitExtraction: orgImplicit },
    { enabled: teamEnabled, implicitExtraction: teamImplicit },
  );
}
