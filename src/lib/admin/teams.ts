import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeTeamTable,
  AsafeTeamMemberTable,
  AsafeTeamBudgetTable,
  AsafeUsageEventTable,
  UserTable,
} from "@/lib/db/pg/schema.pg";
import { eq, sql, gte, lte, desc, and } from "drizzle-orm";

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
    .innerJoin(AsafeTeamTable, eq(AsafeTeamTable.id, AsafeTeamBudgetTable.teamId))
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

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: "admin" | "editor" | "member" = "member",
) {
  // Insert with ON CONFLICT DO UPDATE to handle re-adding
  await db
    .insert(AsafeTeamMemberTable)
    .values({ teamId, userId, role })
    .onConflictDoUpdate({
      target: [AsafeTeamMemberTable.teamId, AsafeTeamMemberTable.userId],
      set: { role },
    });
}

export async function removeTeamMember(memberId: string) {
  await db
    .delete(AsafeTeamMemberTable)
    .where(eq(AsafeTeamMemberTable.id, memberId));
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
