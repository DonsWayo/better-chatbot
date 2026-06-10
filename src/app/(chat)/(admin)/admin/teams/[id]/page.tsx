import { notFound, redirect, unauthorized } from "next/navigation";
import { requireAdminPermission } from "lib/auth/permissions";
import { getSession } from "lib/auth/server";
import { getTeamWithMembers } from "lib/admin/teams";
import { TeamDetailClient } from "@/components/admin/team-detail-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TeamDetailPage({ params }: PageProps) {
  const { id } = await params;

  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const team = await getTeamWithMembers(id);
  if (!team) {
    notFound();
  }

  return <TeamDetailClient team={team} />;
}
