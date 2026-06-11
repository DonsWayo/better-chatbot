import { eq, like } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeOrgSettingsTable } from "lib/db/pg/schema.pg";

// ---------------------------------------------------------------------------
// Local (stdio) MCP policy — ADR-0010 v1 of the local-MCP governance plane,
// layered org → team like the memory policy (lib/memory/policy.ts) and model
// entitlements (lib/admin/model-policy.ts), stored in asafe_org_settings.
//
// Keys (jsonb boolean values; absent/null = unset → fall through):
//   "local_mcp_enabled"                  — org base; unset → FALSE (ADR-0009
//                                          default-deny: local stdio servers
//                                          spawn processes on a machine, so
//                                          nobody gets them until an admin
//                                          opts the org — or a team — in)
//   "team_local_mcp_enabled:<teamId>"    — team override (wins when set)
//
// This file deliberately has no opinion on *where* stdio is possible at all —
// that is the deployment gate (IS_MCP_SERVER_REMOTE_ONLY in lib/const.ts:
// cloud is remote-only, desktop/local dev allow stdio). The policy here layers
// ON TOP of the deployment gate: even where stdio is technically possible, it
// stays off until entitled.
// ---------------------------------------------------------------------------

export const DEFAULT_LOCAL_MCP_ENABLED = false;

export const ORG_LOCAL_MCP_ENABLED_KEY = "local_mcp_enabled";
export const TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX = "team_local_mcp_enabled:";

export function teamLocalMcpEnabledKey(teamId: string): string {
  return `${TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX}${teamId}`;
}

/**
 * Pure layering: team override (when set) wins over org (when set) wins over
 * the default-deny. `null`/`undefined` layers don't participate.
 */
export function resolveLocalMcpLayers(
  org: boolean | null,
  team?: boolean | null,
): boolean {
  return team ?? org ?? DEFAULT_LOCAL_MCP_ENABLED;
}

/**
 * Read one boolean entry from the org settings store. Returns null when
 * absent, malformed, or unreadable — the resolver then falls through to the
 * lower layer / default (default-deny, so failures fail closed).
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

/** Set (or clear with `null`) the org-wide local-MCP switch. */
export async function setOrgLocalMcpEnabled(
  enabled: boolean | null,
): Promise<void> {
  await writeBool(ORG_LOCAL_MCP_ENABLED_KEY, enabled);
}

/** Set (or clear with `null`) a team's local-MCP override. */
export async function setTeamLocalMcpEnabled(
  teamId: string,
  enabled: boolean | null,
): Promise<void> {
  await writeBool(teamLocalMcpEnabledKey(teamId), enabled);
}

/**
 * Effective local-MCP policy for a team context (org base layered with the
 * team override). `teamId` null/undefined → org layer alone. Used wherever a
 * concrete user/team is known: saving a stdio server config, arming a local
 * server for a session.
 */
export async function resolveLocalMcpPolicy(
  teamId?: string | null,
): Promise<boolean> {
  const [org, team] = await Promise.all([
    readBool(ORG_LOCAL_MCP_ENABLED_KEY),
    teamId ? readBool(teamLocalMcpEnabledKey(teamId)) : Promise.resolve(null),
  ]);
  return resolveLocalMcpLayers(org, team);
}

export interface LocalMcpArmApprovalRequestInput {
  serverId: string;
  serverName: string;
  toolName: string;
  /** The server owner — the request is owner-targeted. */
  userId: string;
}

/**
 * Local-MCP consent v2 (ADR-0010): file an owner-targeted approval_request
 * (kind "local_mcp_arm") when an unarmed local stdio tool is invoked, so the
 * grant can happen from the Inbox. Deduped to one open request per
 * (server, user) by the approvals lib. Lazily imported so the agent-platform
 * stack stays out of this module's (and the manager's) static import graph.
 */
export async function requestLocalMcpArmApproval(
  input: LocalMcpArmApprovalRequestInput,
): Promise<{ requestId: string; deduped: boolean }> {
  const { createLocalMcpArmRequest } = await import(
    "lib/agent-platform/approvals"
  );
  const { request, deduped } = await createLocalMcpArmRequest(input);
  return { requestId: request.id, deduped };
}

/** One team's stored local-MCP override (only set values are listed). */
export interface TeamLocalMcpOverride {
  teamId: string;
  enabled: boolean;
}

/**
 * All stored team local-MCP overrides, for the admin overrides UI. Same LIKE
 * scan as `isLocalMcpRuntimeEnabled`; non-boolean values (cleared with `null`)
 * mean inherit and are dropped. Fails soft to `[]` — listing is a UI
 * affordance, not an enforcement path.
 */
export async function listTeamLocalMcpOverrides(): Promise<
  TeamLocalMcpOverride[]
> {
  try {
    const rows = await db
      .select({
        key: AsafeOrgSettingsTable.key,
        value: AsafeOrgSettingsTable.value,
      })
      .from(AsafeOrgSettingsTable)
      .where(
        like(
          AsafeOrgSettingsTable.key,
          `${TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX}%`,
        ),
      );
    return rows
      .flatMap((row) => {
        const teamId = row.key.slice(TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX.length);
        if (!teamId || typeof row.value !== "boolean") return [];
        return [{ teamId, enabled: row.value }];
      })
      .sort((a, b) => a.teamId.localeCompare(b.teamId));
  } catch {
    return [];
  }
}

/**
 * Process-wide runtime gate for the MCP clients manager, which has no user or
 * team context inside `tools()` / `toolCall()`: local stdio tools stay
 * reachable iff the org base is on OR at least one team override is on.
 * Per-team precision is enforced where a user is known (save + arming
 * actions); this answers "may local stdio run in this process at all?".
 * Fails closed (false) on any read error — default-deny.
 */
export async function isLocalMcpRuntimeEnabled(): Promise<boolean> {
  const org = await readBool(ORG_LOCAL_MCP_ENABLED_KEY);
  if (org === true) return true;
  try {
    const rows = await db
      .select({
        key: AsafeOrgSettingsTable.key,
        value: AsafeOrgSettingsTable.value,
      })
      .from(AsafeOrgSettingsTable)
      .where(
        like(
          AsafeOrgSettingsTable.key,
          `${TEAM_LOCAL_MCP_ENABLED_KEY_PREFIX}%`,
        ),
      );
    return rows.some((row) => row.value === true);
  } catch {
    return false;
  }
}
