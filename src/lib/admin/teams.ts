import "server-only";

import {
  AsafeTeamBudgetTable,
  AsafeTeamMemberTable,
  AsafeTeamTable,
  AsafeUsageEventTable,
  UserTable,
} from "@/lib/db/pg/schema.pg";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({ message: "teams: " });

export interface AdminTeamListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  memberCount: number;
  budgetUsd: string | null;
  usedUsd: string | null;
}

export async function getAdminTeams(): Promise<AdminTeamListItem[]> {
  const rows = await db
    .select({
      id: AsafeTeamTable.id,
      name: AsafeTeamTable.name,
      slug: AsafeTeamTable.slug,
      description: AsafeTeamTable.description,
      createdAt: AsafeTeamTable.createdAt,
      memberCount: sql<number>`cast(count(distinct ${AsafeTeamMemberTable.id}) as int)`,
      budgetUsd: AsafeTeamBudgetTable.budgetUsd,
      usedUsd: AsafeTeamBudgetTable.usedUsd,
    })
    .from(AsafeTeamTable)
    .leftJoin(
      AsafeTeamMemberTable,
      eq(AsafeTeamMemberTable.teamId, AsafeTeamTable.id),
    )
    .leftJoin(
      AsafeTeamBudgetTable,
      eq(AsafeTeamBudgetTable.teamId, AsafeTeamTable.id),
    )
    .groupBy(
      AsafeTeamTable.id,
      AsafeTeamTable.name,
      AsafeTeamTable.slug,
      AsafeTeamTable.description,
      AsafeTeamTable.createdAt,
      AsafeTeamBudgetTable.budgetUsd,
      AsafeTeamBudgetTable.usedUsd,
    )
    .orderBy(AsafeTeamTable.createdAt);

  return rows;
}

export async function getUsageSummary(options: {
  days?: number; // default 30
  limit?: number; // default 20
}) {
  const { days = 30, limit = 20 } = options;
  // cutoff date: subtract days from now
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Cost by model (top models by cost)
  const byModel = await db
    .select({
      model: AsafeUsageEventTable.model,
      provider: AsafeUsageEventTable.provider,
      requests: sql<number>`count(*)::int`,
      totalPromptTokens: sql<number>`sum(${AsafeUsageEventTable.promptTokens})::int`,
      totalCompletionTokens: sql<number>`sum(${AsafeUsageEventTable.completionTokens})::int`,
      totalCostUsd: sql<string>`sum(${AsafeUsageEventTable.costUsd})`,
    })
    .from(AsafeUsageEventTable)
    .where(gte(AsafeUsageEventTable.createdAt, cutoff))
    .groupBy(AsafeUsageEventTable.model, AsafeUsageEventTable.provider)
    .orderBy(desc(sql`sum(${AsafeUsageEventTable.costUsd})`))
    .limit(limit);

  // Cost by task class
  const byTaskClass = await db
    .select({
      taskClass: AsafeUsageEventTable.taskClass,
      requests: sql<number>`count(*)::int`,
      totalCostUsd: sql<string>`sum(${AsafeUsageEventTable.costUsd})`,
    })
    .from(AsafeUsageEventTable)
    .where(gte(AsafeUsageEventTable.createdAt, cutoff))
    .groupBy(AsafeUsageEventTable.taskClass)
    .orderBy(desc(sql`sum(${AsafeUsageEventTable.costUsd})`));

  // Grand total
  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalCostUsd: sql<string>`sum(${AsafeUsageEventTable.costUsd})`,
    })
    .from(AsafeUsageEventTable)
    .where(gte(AsafeUsageEventTable.createdAt, cutoff));

  return { byModel, byTaskClass, totals, days };
}

// ---------------------------------------------------------------------------
// Compliance usage aggregation — shared by /api/admin/compliance/usage
// ---------------------------------------------------------------------------

export interface ComplianceUsageBucket {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
}

export interface ComplianceUsageSummary {
  byModel: Array<{ model: string } & ComplianceUsageBucket>;
  byTeam: Array<
    { teamId: string | null; teamName: string | null } & ComplianceUsageBucket
  >;
  total: ComplianceUsageBucket;
}

export interface ComplianceUsageOptions {
  from?: Date;
  to?: Date;
  teamId?: string;
  userId?: string;
}

const EMPTY_USAGE_BUCKET: ComplianceUsageBucket = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: "0",
};

export async function getComplianceUsageSummary(
  options: ComplianceUsageOptions = {},
): Promise<ComplianceUsageSummary> {
  const { from, to, teamId, userId } = options;

  const conditions = [
    from ? gte(AsafeUsageEventTable.createdAt, from) : undefined,
    to ? lte(AsafeUsageEventTable.createdAt, to) : undefined,
    teamId ? eq(AsafeUsageEventTable.teamId, teamId) : undefined,
    userId ? eq(AsafeUsageEventTable.userId, userId) : undefined,
  ].filter((c) => c !== undefined);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const aggregate = {
    requests: sql<number>`count(*)::int`,
    inputTokens: sql<number>`coalesce(sum(${AsafeUsageEventTable.promptTokens}), 0)::int`,
    outputTokens: sql<number>`coalesce(sum(${AsafeUsageEventTable.completionTokens}), 0)::int`,
    costUsd: sql<string>`coalesce(sum(${AsafeUsageEventTable.costUsd}), 0)::text`,
  };

  const [byModel, byTeam, [total]] = await Promise.all([
    db
      .select({ model: AsafeUsageEventTable.model, ...aggregate })
      .from(AsafeUsageEventTable)
      .where(where)
      .groupBy(AsafeUsageEventTable.model)
      .orderBy(desc(sql`sum(${AsafeUsageEventTable.costUsd})`)),
    db
      .select({
        teamId: AsafeUsageEventTable.teamId,
        teamName: AsafeTeamTable.name,
        ...aggregate,
      })
      .from(AsafeUsageEventTable)
      .leftJoin(
        AsafeTeamTable,
        eq(AsafeTeamTable.id, AsafeUsageEventTable.teamId),
      )
      .where(where)
      .groupBy(AsafeUsageEventTable.teamId, AsafeTeamTable.name)
      .orderBy(desc(sql`sum(${AsafeUsageEventTable.costUsd})`)),
    db.select(aggregate).from(AsafeUsageEventTable).where(where),
  ]);

  return {
    byModel,
    byTeam,
    total: total ?? EMPTY_USAGE_BUCKET,
  };
}

// ---------------------------------------------------------------------------
// Budget alert summary — used by the admin usage dashboard
// ---------------------------------------------------------------------------

export interface BudgetAlertItem {
  teamId: string;
  teamName: string;
  budgetUsd: string;
  usedUsd: string;
  periodStart: Date;
  periodEnd: Date;
  utilizationRatio: number;
  alert: boolean;
}

const BUDGET_ALERT_THRESHOLD = 0.8;

export async function getBudgetAlerts(): Promise<BudgetAlertItem[]> {
  const now = new Date();
  const rows = await db
    .select({
      teamId: AsafeTeamBudgetTable.teamId,
      teamName: AsafeTeamTable.name,
      budgetUsd: AsafeTeamBudgetTable.budgetUsd,
      usedUsd: AsafeTeamBudgetTable.usedUsd,
      periodStart: AsafeTeamBudgetTable.periodStart,
      periodEnd: AsafeTeamBudgetTable.periodEnd,
    })
    .from(AsafeTeamBudgetTable)
    .innerJoin(
      AsafeTeamTable,
      eq(AsafeTeamTable.id, AsafeTeamBudgetTable.teamId),
    )
    .where(
      and(
        lte(AsafeTeamBudgetTable.periodStart, now),
        gte(AsafeTeamBudgetTable.periodEnd, now),
      ),
    );

  return rows.map((r) => {
    const ratio =
      parseFloat(r.usedUsd as string) / parseFloat(r.budgetUsd as string);
    return {
      teamId: r.teamId,
      teamName: r.teamName,
      budgetUsd: r.budgetUsd as string,
      usedUsd: r.usedUsd as string,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      utilizationRatio: ratio,
      alert: ratio >= BUDGET_ALERT_THRESHOLD,
    };
  });
}

export async function createTeam(
  name: string,
  description?: string,
): Promise<typeof AsafeTeamTable.$inferSelect> {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const [team] = await db
    .insert(AsafeTeamTable)
    .values({
      name,
      slug,
      description: description ?? null,
    })
    .returning();

  return team;
}

// Get a single team with its members (including user email/name)
export async function getTeamWithMembers(teamId: string) {
  const [team] = await db
    .select()
    .from(AsafeTeamTable)
    .where(eq(AsafeTeamTable.id, teamId))
    .limit(1);
  if (!team) return null;

  const now = new Date();

  const [members, activeBudget] = await Promise.all([
    db
      .select({
        memberId: AsafeTeamMemberTable.id,
        userId: AsafeTeamMemberTable.userId,
        role: AsafeTeamMemberTable.role,
        joinedAt: AsafeTeamMemberTable.createdAt,
        userName: UserTable.name,
        userEmail: UserTable.email,
      })
      .from(AsafeTeamMemberTable)
      .innerJoin(UserTable, eq(AsafeTeamMemberTable.userId, UserTable.id))
      .where(eq(AsafeTeamMemberTable.teamId, teamId)),
    db
      .select()
      .from(AsafeTeamBudgetTable)
      .where(
        and(
          eq(AsafeTeamBudgetTable.teamId, teamId),
          lte(AsafeTeamBudgetTable.periodStart, now),
          gte(AsafeTeamBudgetTable.periodEnd, now),
        ),
      )
      .limit(1),
  ]);

  return { ...team, members, budget: activeBudget[0] ?? null };
}

/** Returns the domain part of an email address, lowercased. */
export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: "admin" | "editor" | "member" = "member",
  userEmail?: string,
) {
  // Enforce email domain allow-list when configured
  if (userEmail) {
    const [teamRow] = await db
      .select({ allowedEmailDomains: AsafeTeamTable.allowedEmailDomains })
      .from(AsafeTeamTable)
      .where(eq(AsafeTeamTable.id, teamId))
      .limit(1);
    const domains = (teamRow?.allowedEmailDomains as string[]) ?? [];
    if (domains.length > 0) {
      const domain = emailDomain(userEmail);
      if (!domains.includes(domain)) {
        throw new Error(
          `Email domain "${domain}" is not allowed for this team.`,
        );
      }
    }
  }

  // Insert with ON CONFLICT DO UPDATE to handle re-adding
  await db
    .insert(AsafeTeamMemberTable)
    .values({ teamId, userId, role })
    .onConflictDoUpdate({
      target: [AsafeTeamMemberTable.teamId, AsafeTeamMemberTable.userId],
      set: { role },
    });
  // Membership changed → the user's resolved cross-team restrictions may differ.
  clearUserPolicyCaches();
  _teamIdCache.delete(userId);
}

/**
 * Remove a team member row. When `teamId` is provided the delete is scoped to
 * that team — defense in depth so a TEAM admin authorized for team A cannot
 * pass a memberId belonging to team B.
 */
export async function removeTeamMember(memberId: string, teamId?: string) {
  await db
    .delete(AsafeTeamMemberTable)
    .where(
      teamId
        ? and(
            eq(AsafeTeamMemberTable.id, memberId),
            eq(AsafeTeamMemberTable.teamId, teamId),
          )
        : eq(AsafeTeamMemberTable.id, memberId),
    );
  // Membership removed → resolved cross-team restrictions may differ. No cheap
  // memberId→userId reverse lookup here, so clear-all (cheap to re-derive).
  clearUserPolicyCaches();
}

/**
 * Update a team member's team-scoped role. When `teamId` is provided the
 * update is scoped to that team (same defense-in-depth as removeTeamMember).
 */
export async function updateTeamMemberRole(
  memberId: string,
  role: "admin" | "editor" | "member",
  teamId?: string,
) {
  await db
    .update(AsafeTeamMemberTable)
    .set({ role })
    .where(
      teamId
        ? and(
            eq(AsafeTeamMemberTable.id, memberId),
            eq(AsafeTeamMemberTable.teamId, teamId),
          )
        : eq(AsafeTeamMemberTable.id, memberId),
    );
}

// ---------------------------------------------------------------------------
// Team-admin tier (asafe_team_member.role = "admin")
//
// Authorization split for team management (see
// content/docs/governance/permissions.mdx):
//   • canManageTeam (global admin OR team admin): membership add/remove,
//     member team-role changes, rename/description — day-to-day people
//     management that only affects the team itself.
//   • global admin ONLY: delete team, budgets, model allow-list, guardrail/
//     capability policy, email-domain allow-list — org-level cost, security
//     and compliance levers a team must not be able to loosen for itself.
//
// Note: the /admin UI routes are gated to global admins at the layout, so a
// team admin cannot currently reach the management screens. These checks make
// the ACTIONS correctly authorized (defense in depth + ready for a future
// team-admin surface); building that UI is a documented follow-up.
// ---------------------------------------------------------------------------

/** True when the user has team-scoped role "admin" in this team. */
export async function isTeamAdmin(
  userId: string,
  teamId: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ role: AsafeTeamMemberTable.role })
      .from(AsafeTeamMemberTable)
      .where(
        and(
          eq(AsafeTeamMemberTable.userId, userId),
          eq(AsafeTeamMemberTable.teamId, teamId),
        ),
      )
      .limit(1);
    return row?.role === "admin";
  } catch {
    // Fail closed: an unreadable membership store grants nothing.
    return false;
  }
}

/**
 * Can this user manage the team (member add/remove, member roles, rename)?
 * Global admins always can; otherwise requires team_member.role === "admin".
 * Fails closed on any error.
 */
export async function canManageTeam(
  userId: string,
  teamId: string,
): Promise<boolean> {
  try {
    const [[userRow], teamAdmin] = await Promise.all([
      db
        .select({ role: UserTable.role })
        .from(UserTable)
        .where(eq(UserTable.id, userId))
        .limit(1),
      isTeamAdmin(userId, teamId),
    ]);
    // Same comma-separated-roles convention as lib/user/utils getIsUserAdmin.
    const isGlobalAdmin = userRow?.role?.split(",").includes("admin") ?? false;
    return isGlobalAdmin || teamAdmin;
  } catch {
    return false;
  }
}

export async function updateTeam(
  teamId: string,
  patch: { name?: string; description?: string | null },
) {
  if (patch.name !== undefined) {
    const slug = patch.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    await db
      .update(AsafeTeamTable)
      .set({
        name: patch.name,
        slug,
        description: patch.description ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(AsafeTeamTable.id, teamId));
  } else if (patch.description !== undefined) {
    await db
      .update(AsafeTeamTable)
      .set({ description: patch.description, updatedAt: new Date() })
      .where(eq(AsafeTeamTable.id, teamId));
  }
}

export async function deleteTeam(teamId: string) {
  await db.delete(AsafeTeamTable).where(eq(AsafeTeamTable.id, teamId));
  _teamPolicyCache.delete(teamId);
  clearUserPolicyCaches();
}

// ---------------------------------------------------------------------------
// getUserPrimaryTeamId — lightweight lookup with a 60-second in-process cache.
// Used by the chat route to attach a teamId to budget checks and usage events
// without adding a DB round-trip on every request after the first.
// ---------------------------------------------------------------------------

interface TeamIdCacheEntry {
  teamId: string | null;
  expiresAt: number;
}

const _teamIdCache = new Map<string, TeamIdCacheEntry>();
const TEAM_ID_CACHE_TTL_MS = 60_000;

export async function getUserPrimaryTeamId(
  userId: string,
): Promise<string | null> {
  const now = Date.now();
  const cached = _teamIdCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.teamId;
  }

  try {
    const [row] = await db
      .select({ teamId: AsafeTeamMemberTable.teamId })
      .from(AsafeTeamMemberTable)
      .where(eq(AsafeTeamMemberTable.userId, userId))
      .limit(1);

    const teamId = row?.teamId ?? null;
    _teamIdCache.set(userId, { teamId, expiresAt: now + TEAM_ID_CACHE_TTL_MS });
    return teamId;
  } catch (e) {
    // Serve the last-known-good cached teamId on error (even if stale) so we
    // don't drop budget/governance attribution; only fall back to null when we
    // have no cached value. Either way, log — a null teamId silently disables
    // budget enforcement and audit team-scoping.
    logger.error("getUserPrimaryTeamId resolution failed", e);
    if (cached) return cached.teamId;
    return null;
  }
}

export interface TeamPolicy {
  guardrailPolicy: string;
  allowImageGen: boolean;
  allowVision: boolean;
  allowSpeech: boolean;
  /**
   * Per-tool flags. DEFAULT TRUE: absence (or a pre-migration null) means the
   * tool is allowed, so existing teams are unchanged. These further restrict
   * WITHIN the canUseTools (admin/editor) gate — a disabled tool is never bound
   * even for an elevated user whose team disallows it.
   */
  allowWebSearch: boolean;
  allowCodeExec: boolean;
  allowHttp: boolean;
  /**
   * EFFECTIVE model allow-list: org base layered with the team's
   * model_policy override (see lib/admin/model-policy.ts).
   * Empty array = all approved models allowed; non-empty = restricted to listed model IDs
   */
  modelAllowList: string[];
  /** Empty array = any email domain allowed; non-empty = only matching domains */
  allowedEmailDomains: string[];
}

const _teamPolicyCache = new Map<
  string,
  { policy: TeamPolicy; expiresAt: number }
>();

export async function getTeamPolicy(teamId: string): Promise<TeamPolicy> {
  const now = Date.now();
  const cached = _teamPolicyCache.get(teamId);
  if (cached && cached.expiresAt > now) return cached.policy;

  try {
    const [row] = await db
      .select({
        guardrailPolicy: AsafeTeamTable.guardrailPolicy,
        allowImageGen: AsafeTeamTable.allowImageGen,
        allowVision: AsafeTeamTable.allowVision,
        allowSpeech: AsafeTeamTable.allowSpeech,
        allowWebSearch: AsafeTeamTable.allowWebSearch,
        allowCodeExec: AsafeTeamTable.allowCodeExec,
        allowHttp: AsafeTeamTable.allowHttp,
        modelAllowList: AsafeTeamTable.modelAllowList,
        modelPolicy: AsafeTeamTable.modelPolicy,
        allowedEmailDomains: AsafeTeamTable.allowedEmailDomains,
      })
      .from(AsafeTeamTable)
      .where(eq(AsafeTeamTable.id, teamId))
      .limit(1);

    // Layer the org base allow-list with the team's override (model_policy,
    // or the legacy model_allow_list treated as a "replace" override).
    // null = unrestricted → mapped to [] to keep this contract stable.
    const { getOrgBaseModelAllowList, resolveModelAllowList } = await import(
      "./model-policy"
    );
    const orgBase = await getOrgBaseModelAllowList();
    const effectiveAllowList =
      resolveModelAllowList(
        orgBase,
        row?.modelPolicy ?? null,
        row?.modelAllowList ?? null,
      ) ?? [];

    const policy: TeamPolicy = row
      ? {
          guardrailPolicy: row.guardrailPolicy,
          allowImageGen: row.allowImageGen,
          allowVision: row.allowVision,
          allowSpeech: row.allowSpeech,
          // Per-tool flags default-ON: treat null (pre-migration) as allowed.
          allowWebSearch: row.allowWebSearch ?? true,
          allowCodeExec: row.allowCodeExec ?? true,
          allowHttp: row.allowHttp ?? true,
          modelAllowList: effectiveAllowList,
          allowedEmailDomains: row.allowedEmailDomains,
        }
      : {
          guardrailPolicy: "standard",
          allowImageGen: false,
          allowVision: false,
          allowSpeech: false,
          // No team → no per-tool restriction (default-ON).
          allowWebSearch: true,
          allowCodeExec: true,
          allowHttp: true,
          modelAllowList: effectiveAllowList,
          allowedEmailDomains: [],
        };
    _teamPolicyCache.set(teamId, {
      policy,
      expiresAt: now + TEAM_ID_CACHE_TTL_MS,
    });
    return policy;
  } catch (e) {
    logger.error("getTeamPolicy resolution failed", e);

    // Last-known-good: serve the cached policy (even if expired) rather than
    // fabricating a permissive default that could silently downgrade a strict
    // team. This is the correct posture under a partial/transient DB failure.
    if (cached) return cached.policy;

    // No cached value to fall back on → fail CLOSED. Never silently downgrade
    // guardrails to "standard"; assume the strictest posture so a broken
    // entitlement layer can't weaken safety controls. Capabilities (image
    // gen / vision / speech) default off. modelAllowList stays [] (the
    // "unrestricted" sentinel) deliberately: with the DB down we can't
    // enumerate a safe list, and locking every model out would take down all
    // chat — model gating is a softer control than guardrails, so we keep the
    // don't-lock-everyone-out intent there while failing closed on guardrails.
    return {
      guardrailPolicy: "strict",
      allowImageGen: false,
      allowVision: false,
      allowSpeech: false,
      // Per-tool flags are default-ON and only ever further-restrict an already
      // elevated user; keeping them ON under a transient DB failure follows the
      // same "don't lock everyone out" intent as modelAllowList above (the hard
      // safety controls — guardrails/capabilities — are the ones that fail closed).
      allowWebSearch: true,
      allowCodeExec: true,
      allowHttp: true,
      modelAllowList: [],
      allowedEmailDomains: [],
    };
  }
}

export async function updateTeamPolicy(
  teamId: string,
  patch: Partial<TeamPolicy>,
): Promise<void> {
  await db
    .update(AsafeTeamTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(AsafeTeamTable.id, teamId));
  // Invalidate cache. The per-team policy AND the per-user resolved
  // restrictions (which fan out from getTeamPolicy) both go stale here.
  _teamPolicyCache.delete(teamId);
  clearUserPolicyCaches();
}

// ---------------------------------------------------------------------------
// Multi-team governance scope
//
// DECISION (ERP-style split — do NOT redesign):
//   • RESTRICTIONS (per-tool flags + guardrail posture): resolve across EVERY
//     team the user belongs to and apply the MOST RESTRICTIVE. A tool is
//     available only if ALL the user's teams allow it (logical AND); the
//     guardrail posture is the STRICTEST among the user's teams
//     (strict > standard > permissive). This closes the "escape via a looser
//     team" hole — an admin who tightens a LATER-joined team is no longer
//     silently ignored (the old getUserPrimaryTeamId keyed only off the
//     EARLIEST-joined team). It never locks a user out of CHAT: it only
//     removes tools / tightens scanning.
//   • ENTITLEMENTS / BILLING (model allow-list + budget): KEEP the existing
//     PRIMARY-team behavior. These are entitlement/billing levers, and an
//     allow-list INTERSECTION across many teams would lock out multi-team
//     users (e.g. the seed `editor` is in 12 teams). They stay keyed to
//     getUserPrimaryTeamId — see the chat route / effective-models resolver.
//
// In short: restrictions = most-restrictive-across-ALL-teams;
//           entitlements = primary-team.
// ---------------------------------------------------------------------------

/** The restriction subset of a team policy resolved across all of a user's teams. */
export interface EffectiveToolPolicy {
  /** A tool is allowed only if EVERY team the user belongs to allows it (AND). */
  allowWebSearch: boolean;
  allowCodeExec: boolean;
  allowHttp: boolean;
}

/** Guardrail strictness ordering: higher = stricter. */
const GUARDRAIL_STRICTNESS: Record<string, number> = {
  permissive: 0,
  standard: 1,
  strict: 2,
};

/** Pick the strictest of two guardrail postures (strict > standard > permissive). */
function stricterGuardrail(a: string, b: string): string {
  const ra = GUARDRAIL_STRICTNESS[a] ?? GUARDRAIL_STRICTNESS.standard;
  const rb = GUARDRAIL_STRICTNESS[b] ?? GUARDRAIL_STRICTNESS.standard;
  return ra >= rb ? a : b;
}

/** Load every teamId the user is a member of (no LIMIT — unlike the primary-team lookup). */
async function getAllUserTeamIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ teamId: AsafeTeamMemberTable.teamId })
    .from(AsafeTeamMemberTable)
    .where(eq(AsafeTeamMemberTable.userId, userId));
  return rows.map((r) => r.teamId);
}

// ---------------------------------------------------------------------------
// Per-user resolved-restriction caches (hot path).
//
// resolveEffectiveToolPolicy / resolveStrictestGuardrailPolicy scan
// asafe_team_member across ALL the user's teams on EVERY chat message, then
// fan out a getTeamPolicy per team. That's the multi-team policy resolver the
// perf audit flagged as adding per-request latency. We cache the FINAL
// resolved restriction (keyed by userId) for a short TTL — same Map+TTL shape
// as _teamPolicyCache / _teamIdCache above.
//
// Staleness is bounded and safe: membership/policy changes are reflected
// within the TTL, and every admin mutation that already invalidates
// _teamPolicyCache also clears these (clearUserPolicyCaches). Per-team
// membership mutations have no cheap reverse index user→teams, so they
// clear-all rather than risk serving a stale restriction — the resolved value
// is tiny and re-derived on the next request, so a full clear is cheap.
//
// These are RESTRICTIONS (soft tool flags + guardrail posture). They are NOT
// budget/spend, which must stay live — those are never cached here.
// ---------------------------------------------------------------------------

const _effectiveToolPolicyCache = new Map<
  string,
  { policy: EffectiveToolPolicy; expiresAt: number }
>();
const _strictestGuardrailCache = new Map<
  string,
  { policy: string | undefined; expiresAt: number }
>();
const USER_POLICY_CACHE_TTL_MS = 30_000;

/**
 * Invalidate the per-user resolved-restriction caches (all users). Called by
 * the membership/policy mutations below; also exported so other admin paths
 * (and tests) can force a fresh resolve.
 */
export function clearUserPolicyCaches(): void {
  _effectiveToolPolicyCache.clear();
  _strictestGuardrailCache.clear();
}

/**
 * Resolve the user's effective PER-TOOL restrictions across ALL their teams
 * (logical AND). A tool is available only if every one of the user's teams
 * allows it; any single team disabling a tool removes it everywhere.
 *
 * Per-tool flags are default-ON, so a user whose teams never explicitly disable
 * a tool keeps all tools — this is why the seed `editor` (12 teams, all
 * default-true) is unaffected. Fails OPEN (all-true) on a DB error, matching
 * getTeamPolicy's "don't lock everyone out" posture for these soft controls.
 */
export async function resolveEffectiveToolPolicy(
  userId: string,
): Promise<EffectiveToolPolicy> {
  const now = Date.now();
  const cached = _effectiveToolPolicyCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.policy;

  try {
    const teamIds = await getAllUserTeamIds(userId);
    let policy: EffectiveToolPolicy;
    if (teamIds.length === 0) {
      // No team → no per-tool restriction (matches getTeamPolicy's no-team path).
      policy = { allowWebSearch: true, allowCodeExec: true, allowHttp: true };
    } else {
      const policies = await Promise.all(
        teamIds.map((id) => getTeamPolicy(id)),
      );
      policy = {
        // AND across every team: false the moment ANY team disables the tool.
        allowWebSearch: policies.every((p) => p.allowWebSearch),
        allowCodeExec: policies.every((p) => p.allowCodeExec),
        allowHttp: policies.every((p) => p.allowHttp),
      };
    }
    _effectiveToolPolicyCache.set(userId, {
      policy,
      expiresAt: now + USER_POLICY_CACHE_TTL_MS,
    });
    return policy;
  } catch (e) {
    logger.error("resolveEffectiveToolPolicy failed", e);
    // Soft controls fail OPEN so a transient DB error never strips a user's
    // tools (consistent with getTeamPolicy's per-tool fallback).
    return { allowWebSearch: true, allowCodeExec: true, allowHttp: true };
  }
}

/**
 * Resolve the STRICTEST guardrail posture across ALL the user's teams
 * (strict > standard > permissive). Used for prompt/output scanning so a user
 * in a strict team cannot escape scanning by also belonging to a permissive one.
 *
 * Returns undefined when the user has no team (caller falls back to the org
 * default). Fails CLOSED to "strict" on a DB error — guardrails are a HARD
 * safety control (mirrors getTeamPolicy's fail-closed guardrail posture).
 */
export async function resolveStrictestGuardrailPolicy(
  userId: string,
): Promise<string | undefined> {
  const now = Date.now();
  const cached = _strictestGuardrailCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.policy;

  try {
    const teamIds = await getAllUserTeamIds(userId);
    const policy =
      teamIds.length === 0
        ? undefined
        : (
            await Promise.all(teamIds.map((id) => getTeamPolicy(id)))
          ).reduce<string>(
            (acc, p) => stricterGuardrail(acc, p.guardrailPolicy),
            "permissive",
          );
    _strictestGuardrailCache.set(userId, {
      policy,
      expiresAt: now + USER_POLICY_CACHE_TTL_MS,
    });
    return policy;
  } catch (e) {
    logger.error("resolveStrictestGuardrailPolicy failed", e);
    // Hard safety control: never silently downgrade — assume strictest.
    return "strict";
  }
}
