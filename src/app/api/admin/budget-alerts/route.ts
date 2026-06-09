import { getSession } from "lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafeTeamBudgetTable, AsafeTeamTable } from "@/lib/db/pg/schema.pg";
import { and, lte, gte, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

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

  const alerts = rows.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    budgetUsd: r.budgetUsd,
    usedUsd: r.usedUsd,
    utilizationRatio:
      parseFloat(r.usedUsd as string) / parseFloat(r.budgetUsd as string),
    alert:
      parseFloat(r.usedUsd as string) / parseFloat(r.budgetUsd as string) >=
      0.8,
  }));

  return NextResponse.json({ alerts });
}
