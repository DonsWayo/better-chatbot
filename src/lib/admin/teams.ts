import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeTeamTable,
  AsafeTeamMemberTable,
  AsafeTeamBudgetTable,
} from "@/lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";

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
