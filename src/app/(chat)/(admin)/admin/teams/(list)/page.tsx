import { EntraTeamMappingsCard } from "@/components/admin/entra-team-mappings-card";
import { TeamsTable } from "@/components/admin/teams-table";
import { getAdminTeams } from "lib/admin/teams";
import { getEntraTeamMappings } from "lib/auth/entra-team-mappings";
import { requireAdminPermission } from "lib/auth/permissions";
import { getSession } from "lib/auth/server";
import { redirect, unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TeamListPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const [teams, entraMappings] = await Promise.all([
    getAdminTeams(),
    getEntraTeamMappings(),
  ]);

  const teamOptions = teams.map((team) => ({ id: team.id, name: team.name }));

  return (
    <div className="flex flex-col gap-6 w-full">
      <TeamsTable teams={teams} />
      <EntraTeamMappingsCard
        initialMappings={entraMappings}
        teams={teamOptions}
      />
    </div>
  );
}
