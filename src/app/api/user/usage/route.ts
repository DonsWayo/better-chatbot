import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb } from "lib/db/pg/db.pg";
import {
  AsafeTeamBudgetTable,
  AsafeTeamMemberTable,
  AsafeUsageEventTable,
} from "lib/db/pg/schema.pg";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * GET /api/user/usage
 * Returns the current user's usage summary for the last 30 days +
 * their team budget status. User-scoped (no admin required).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  // Usage summary (last 30 days)
  const [summary] = await pgDb
    .select({
      totalCostUsd: sql<string>`coalesce(sum(cost_usd), '0')`,
      promptTokens: sql<number>`coalesce(sum(prompt_tokens), 0)::int`,
      completionTokens: sql<number>`coalesce(sum(completion_tokens), 0)::int`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(AsafeUsageEventTable)
    .where(
      and(
        eq(AsafeUsageEventTable.userId, userId),
        gte(AsafeUsageEventTable.createdAt, cutoff),
      ),
    );

  // Per-model breakdown
  const byModel = await pgDb
    .select({
      model: AsafeUsageEventTable.model,
      provider: AsafeUsageEventTable.provider,
      costUsd: sql<string>`coalesce(sum(cost_usd), '0')`,
      promptTokens: sql<number>`coalesce(sum(prompt_tokens), 0)::int`,
      completionTokens: sql<number>`coalesce(sum(completion_tokens), 0)::int`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(AsafeUsageEventTable)
    .where(
      and(
        eq(AsafeUsageEventTable.userId, userId),
        gte(AsafeUsageEventTable.createdAt, cutoff),
      ),
    )
    .groupBy(AsafeUsageEventTable.model, AsafeUsageEventTable.provider)
    .orderBy(sql`sum(cost_usd) desc`);

  // Team budget (if user is on a team with a budget in the current period)
  const now = new Date();
  const [memberRow] = await pgDb
    .select({ teamId: AsafeTeamMemberTable.teamId })
    .from(AsafeTeamMemberTable)
    .where(eq(AsafeTeamMemberTable.userId, userId))
    .limit(1);

  let budget: { budgetUsd: string; usedUsd: string; pct: number; periodStart: string; periodEnd: string } | null = null;
  if (memberRow?.teamId) {
    const [budgetRow] = await pgDb
      .select({
        budgetUsd: AsafeTeamBudgetTable.budgetUsd,
        usedUsd: AsafeTeamBudgetTable.usedUsd,
        periodStart: AsafeTeamBudgetTable.periodStart,
        periodEnd: AsafeTeamBudgetTable.periodEnd,
      })
      .from(AsafeTeamBudgetTable)
      .where(
        and(
          eq(AsafeTeamBudgetTable.teamId, memberRow.teamId),
          gte(AsafeTeamBudgetTable.periodEnd, now),
        ),
      )
      .limit(1);

    if (budgetRow) {
      const pct =
        Number(budgetRow.budgetUsd) > 0
          ? Math.round((Number(budgetRow.usedUsd) / Number(budgetRow.budgetUsd)) * 100)
          : 0;
      budget = {
        budgetUsd: budgetRow.budgetUsd,
        usedUsd: budgetRow.usedUsd,
        pct,
        periodStart: budgetRow.periodStart.toISOString(),
        periodEnd: budgetRow.periodEnd.toISOString(),
      };
    }
  }

  return NextResponse.json({ summary, byModel, budget });
}
