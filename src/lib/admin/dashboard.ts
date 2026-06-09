import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import {
  UserTable,
  AsafeTeamTable,
  AsafeUsageEventTable,
  AsafeGuardrailEventTable,
  AsafeTeamBudgetTable,
} from "@/lib/db/pg/schema.pg";
import { sql, gte, lte, and } from "drizzle-orm";

export interface DashboardStats {
  totalUsers: number;
  totalTeams: number;
  requestsLast24h: number;
  costLast24hUsd: number;
  requestsLast7d: number;
  costLast7dUsd: number;
  guardrailFiringsLast24h: number;
  budgetsNearLimit: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    [userCount],
    [teamCount],
    [usage24h],
    [usage7d],
    [guardrails24h],
    budgetRows,
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(UserTable),
    db.select({ total: sql<number>`count(*)::int` }).from(AsafeTeamTable),
    db
      .select({
        requests: sql<number>`count(*)::int`,
        costUsd: sql<string>`coalesce(sum(${AsafeUsageEventTable.costUsd}), 0)`,
      })
      .from(AsafeUsageEventTable)
      .where(gte(AsafeUsageEventTable.createdAt, oneDayAgo)),
    db
      .select({
        requests: sql<number>`count(*)::int`,
        costUsd: sql<string>`coalesce(sum(${AsafeUsageEventTable.costUsd}), 0)`,
      })
      .from(AsafeUsageEventTable)
      .where(gte(AsafeUsageEventTable.createdAt, sevenDaysAgo)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(AsafeGuardrailEventTable)
      .where(gte(AsafeGuardrailEventTable.createdAt, oneDayAgo)),
    db
      .select({
        budgetUsd: AsafeTeamBudgetTable.budgetUsd,
        usedUsd: AsafeTeamBudgetTable.usedUsd,
      })
      .from(AsafeTeamBudgetTable)
      .where(
        and(
          lte(AsafeTeamBudgetTable.periodStart, now),
          gte(AsafeTeamBudgetTable.periodEnd, now),
        ),
      ),
  ]);

  const ALERT_THRESHOLD = 0.8;
  const budgetsNearLimit = budgetRows.filter((b) => {
    const budget = parseFloat(b.budgetUsd as string);
    const used = parseFloat(b.usedUsd as string);
    return budget > 0 && used / budget >= ALERT_THRESHOLD;
  }).length;

  return {
    totalUsers: userCount?.total ?? 0,
    totalTeams: teamCount?.total ?? 0,
    requestsLast24h: usage24h?.requests ?? 0,
    costLast24hUsd: parseFloat(usage24h?.costUsd ?? "0"),
    requestsLast7d: usage7d?.requests ?? 0,
    costLast7dUsd: parseFloat(usage7d?.costUsd ?? "0"),
    guardrailFiringsLast24h: guardrails24h?.total ?? 0,
    budgetsNearLimit,
  };
}
