import { requireAdminPermission } from "auth/permissions";
import { unauthorized } from "next/navigation";
import { GuardrailEventsTable } from "@/components/admin/guardrail-events-table";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeGuardrailEventTable } from "lib/db/pg/schema.pg";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function GuardrailsPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const events = await pgDb
    .select()
    .from(AsafeGuardrailEventTable)
    .orderBy(desc(AsafeGuardrailEventTable.createdAt))
    .limit(200);

  return <GuardrailEventsTable events={events} />;
}
