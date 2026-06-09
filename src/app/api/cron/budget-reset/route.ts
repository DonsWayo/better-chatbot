/**
 * POST /api/cron/budget-reset
 *
 * Called by a scheduler (e.g. Kubernetes CronJob, ECS Scheduled Task) once per day.
 * For every team whose active budget period has ended, rolls the budget forward
 * by the same interval (period_end - period_start) and resets used_usd to 0.
 *
 * Auth: Bearer token from CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeTeamBudgetTable } from "@/lib/db/pg/schema.pg";
import { lt, sql } from "drizzle-orm";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({ message: "cron/budget-reset: " });

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Fetch budgets whose period has ended
  const expired = await db
    .select()
    .from(AsafeTeamBudgetTable)
    .where(lt(AsafeTeamBudgetTable.periodEnd, now));

  if (expired.length === 0) {
    logger.info("no expired budgets, nothing to reset");
    return NextResponse.json({ reset: 0 });
  }

  let reset = 0;
  for (const budget of expired) {
    const periodLen =
      new Date(budget.periodEnd).getTime() - new Date(budget.periodStart).getTime();
    const newStart = new Date(budget.periodEnd);
    const newEnd = new Date(newStart.getTime() + periodLen);

    await db
      .update(AsafeTeamBudgetTable)
      .set({
        periodStart: newStart,
        periodEnd: newEnd,
        usedUsd: "0",
        updatedAt: now,
      })
      .where(sql`${AsafeTeamBudgetTable.id} = ${budget.id}`);

    reset++;
    logger.info(`reset budget for team ${budget.teamId}: new period ${newStart.toISOString()} – ${newEnd.toISOString()}`);
  }

  return NextResponse.json({ reset });
}
