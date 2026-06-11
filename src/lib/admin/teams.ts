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
  } catch {
    // Fail open: if the DB is unavailable, fall back to no team rather than
    // blocking the chat request.
    return null;
  }
}

export interface TeamPolicy {
  guardrailPolicy: string;
  allowImageGen: boolean;
  allowVision: boolean;
  allowSpeech: boolean;
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
          modelAllowList: effectiveAllowList,
          allowedEmailDomains: row.allowedEmailDomains,
        }
      : {
          guardrailPolicy: "standard",
          allowImageGen: false,
          allowVision: false,
          allowSpeech: false,
          modelAllowList: effectiveAllowList,
          allowedEmailDomains: [],
        };
    _teamPolicyCache.set(teamId, {
      policy,
      expiresAt: now + TEAM_ID_CACHE_TTL_MS,
    });
    return policy;
  } catch {
    return {
      guardrailPolicy: "standard",
      allowImageGen: false,
      allowVision: false,
      allowSpeech: false,
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
  // Invalidate cache
  _teamPolicyCache.delete(teamId);
}
