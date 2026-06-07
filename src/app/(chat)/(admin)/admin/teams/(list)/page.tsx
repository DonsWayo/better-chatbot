import { TeamsTable } from "@/components/admin/teams-table";
import { getAdminTeams } from "lib/admin/teams";
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
    redirect("/login");
  }

  const teams = await getAdminTeams();

  return <TeamsTable teams={teams} />;
}
