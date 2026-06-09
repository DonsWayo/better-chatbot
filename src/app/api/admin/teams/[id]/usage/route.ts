import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeUsageEventTable } from "@/lib/db/pg/schema.pg";
import { eq, gte, desc, sql } from "drizzle-orm";
import { and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: teamId } = await params;
  const days = Math.min(365, Math.max(1, parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10)));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const [byModel, [totals]] = await Promise.all([
    db
      .select({
        model: AsafeUsageEventTable.model,
        provider: AsafeUsageEventTable.provider,
        requests: sql<number>`count(*)::int`,
        totalPromptTokens: sql<number>`sum(${AsafeUsageEventTable.promptTokens})::int`,
        totalCompletionTokens: sql<number>`sum(${AsafeUsageEventTable.completionTokens})::int`,
        totalCostUsd: sql<string>`sum(${AsafeUsageEventTable.costUsd})`,
      })
      .from(AsafeUsageEventTable)
      .where(and(eq(AsafeUsageEventTable.teamId, teamId), gte(AsafeUsageEventTable.createdAt, cutoff)))
      .groupBy(AsafeUsageEventTable.model, AsafeUsageEventTable.provider)
      .orderBy(desc(sql`sum(${AsafeUsageEventTable.costUsd})`))
      .limit(20),
    db
      .select({
        totalRequests: sql<number>`count(*)::int`,
        totalCostUsd: sql<string>`sum(${AsafeUsageEventTable.costUsd})`,
        totalPromptTokens: sql<number>`sum(${AsafeUsageEventTable.promptTokens})::int`,
        totalCompletionTokens: sql<number>`sum(${AsafeUsageEventTable.completionTokens})::int`,
      })
      .from(AsafeUsageEventTable)
      .where(and(eq(AsafeUsageEventTable.teamId, teamId), gte(AsafeUsageEventTable.createdAt, cutoff))),
  ]);

  return NextResponse.json({ byModel, totals, days });
}
