import { UsageTable } from "@/components/admin/usage-table";
import { getUsageSummary } from "lib/admin/teams";
import { requireAdminPermission } from "auth/permissions";
import { getSession } from "lib/auth/server";
import { redirect, unauthorized } from "next/navigation";

// Force dynamic rendering to avoid static generation issues with session
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    days?: string;
  }>;
}

export default async function UsagePage({ searchParams }: PageProps) {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const days = parseInt(params.days ?? "30", 10);

  const data = await getUsageSummary({ days });

  return <UsageTable data={data} />;
}
