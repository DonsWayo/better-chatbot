import { requireAdminPermission } from "auth/permissions";
import { unauthorized } from "next/navigation";
import { QualityDashboard } from "@/components/admin/quality-dashboard";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeMessageFeedbackTable } from "lib/db/pg/schema.pg";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  // Last 100 individual feedback records
  const recent = await pgDb
    .select()
    .from(AsafeMessageFeedbackTable)
    .orderBy(desc(AsafeMessageFeedbackTable.createdAt))
    .limit(100);

  // Aggregate: total up / down counts
  const totals = await pgDb
    .select({
      rating: AsafeMessageFeedbackTable.rating,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(AsafeMessageFeedbackTable)
    .groupBy(AsafeMessageFeedbackTable.rating);

  const upCount = totals.find((r) => r.rating === "up")?.count ?? 0;
  const downCount = totals.find((r) => r.rating === "down")?.count ?? 0;

  return (
    <QualityDashboard
      recent={recent}
      upCount={upCount}
      downCount={downCount}
    />
  );
}
