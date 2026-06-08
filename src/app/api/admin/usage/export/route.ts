import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb } from "lib/db/pg/db.pg";
import {
  AsafeTeamTable,
  AsafeUsageEventTable,
  UserTable,
} from "lib/db/pg/schema.pg";
import { desc, gte, and, eq } from "drizzle-orm";

/**
 * GET /api/admin/usage/export?days=30
 * Download usage events as CSV for finance/chargeback reporting. Admin-only.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const days = Math.min(
    365,
    Number(request.nextUrl.searchParams.get("days") ?? "30"),
  );
  if (isNaN(days) || days <= 0)
    return NextResponse.json({ error: "Invalid days parameter" }, { status: 400 });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await pgDb
    .select({
      createdAt: AsafeUsageEventTable.createdAt,
      userEmail: UserTable.email,
      teamName: AsafeTeamTable.name,
      model: AsafeUsageEventTable.model,
      provider: AsafeUsageEventTable.provider,
      taskClass: AsafeUsageEventTable.taskClass,
      promptTokens: AsafeUsageEventTable.promptTokens,
      completionTokens: AsafeUsageEventTable.completionTokens,
      costUsd: AsafeUsageEventTable.costUsd,
    })
    .from(AsafeUsageEventTable)
    .leftJoin(UserTable, eq(AsafeUsageEventTable.userId, UserTable.id))
    .leftJoin(AsafeTeamTable, eq(AsafeUsageEventTable.teamId, AsafeTeamTable.id))
    .where(and(gte(AsafeUsageEventTable.createdAt, cutoff)))
    .orderBy(desc(AsafeUsageEventTable.createdAt));

  const header =
    "timestamp,user_email,team,model,provider,task_class,prompt_tokens,completion_tokens,cost_usd\n";

  const lines = rows.map((r) => {
    const cells = [
      r.createdAt.toISOString(),
      csvEscape(r.userEmail ?? ""),
      csvEscape(r.teamName ?? ""),
      csvEscape(r.model),
      csvEscape(r.provider),
      csvEscape(r.taskClass ?? ""),
      String(r.promptTokens),
      String(r.completionTokens),
      String(r.costUsd),
    ];
    return cells.join(",");
  });

  const csv = header + lines.join("\n");
  const filename = `asafe-ai-usage-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
