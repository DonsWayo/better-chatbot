import { requireAdminPermission } from "auth/permissions";
import { unauthorized } from "next/navigation";
import { FeatureFlagsPanel } from "@/components/admin/feature-flags-panel";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeFeatureFlagTable } from "lib/db/pg/schema.pg";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const flags = await pgDb
    .select()
    .from(AsafeFeatureFlagTable)
    .orderBy(AsafeFeatureFlagTable.name);

  return <FeatureFlagsPanel initialFlags={flags} />;
}
