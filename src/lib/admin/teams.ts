import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeTeamTable,
  AsafeTeamMemberTable,
  AsafeTeamBudgetTable,
  AsafeUsageEventTable,
  UserTable,
} from "@/lib/db/pg/schema.pg";
import { eq, sql, gte, desc } from "drizzle-orm";

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
  const team = await db.query.AsafeTeamTable.findFirst({
    where: eq(AsafeTeamTable.id, teamId),
  });
  if (!team) return null;

  const members = await db
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
    .where(eq(AsafeTeamMemberTable.teamId, teamId));

  return { ...team, members };
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
