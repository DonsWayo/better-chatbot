import { FeatureFlagsPanel } from "@/components/admin/feature-flags-panel";
import { MemoryPolicyCard } from "@/components/admin/memory-policy-card";
import { requireAdminPermission } from "auth/permissions";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeFeatureFlagTable } from "lib/db/pg/schema.pg";
import { resolveMemoryPolicy } from "lib/memory/policy";
import { unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const [flags, memoryPolicy] = await Promise.all([
    pgDb
      .select()
      .from(AsafeFeatureFlagTable)
      .orderBy(AsafeFeatureFlagTable.name),
    // Org layer only (no team context) — exactly what the two switches edit.
    resolveMemoryPolicy(null),
  ]);

  return (
    <>
      <FeatureFlagsPanel initialFlags={flags} />
      <div className="px-6 pb-6">
        <MemoryPolicyCard
          initialEnabled={memoryPolicy.enabled}
          initialImplicitExtraction={memoryPolicy.implicitExtraction}
        />
      </div>
    </>
  );
}
