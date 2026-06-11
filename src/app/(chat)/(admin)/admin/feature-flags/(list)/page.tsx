import { FeatureFlagsPanel } from "@/components/admin/feature-flags-panel";
import { LocalMcpPolicyCard } from "@/components/admin/local-mcp-policy-card";
import { MemoryPolicyCard } from "@/components/admin/memory-policy-card";
import { requireAdminPermission } from "auth/permissions";
import { getAdminTeams } from "lib/admin/teams";
import {
  listTeamLocalMcpOverrides,
  resolveLocalMcpPolicy,
} from "lib/ai/mcp/local-policy";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeFeatureFlagTable } from "lib/db/pg/schema.pg";
import {
  listTeamMemoryOverrides,
  resolveMemoryPolicy,
} from "lib/memory/policy";
import { unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const [
    flags,
    memoryPolicy,
    localMcpEnabled,
    teams,
    memoryOverrides,
    localMcpOverrides,
  ] = await Promise.all([
    pgDb
      .select()
      .from(AsafeFeatureFlagTable)
      .orderBy(AsafeFeatureFlagTable.name),
    // Org layer only (no team context) — exactly what the switches edit.
    resolveMemoryPolicy(null),
    resolveLocalMcpPolicy(null),
    getAdminTeams(),
    listTeamMemoryOverrides(),
    listTeamLocalMcpOverrides(),
  ]);

  const teamOptions = teams.map((team) => ({ id: team.id, name: team.name }));

  return (
    <>
      <FeatureFlagsPanel initialFlags={flags} />
      <div className="px-6 pb-6 flex flex-col gap-6">
        <MemoryPolicyCard
          initialEnabled={memoryPolicy.enabled}
          initialImplicitExtraction={memoryPolicy.implicitExtraction}
          teams={teamOptions}
          initialOverrides={memoryOverrides}
        />
        <LocalMcpPolicyCard
          initialEnabled={localMcpEnabled}
          teams={teamOptions}
          initialOverrides={localMcpOverrides}
        />
      </div>
    </>
  );
}
