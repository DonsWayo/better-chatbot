import { UsageTable } from "@/components/admin/usage-table";
import { BudgetAlertsWidget } from "@/components/admin/budget-alerts-widget";
import { getUsageSummary, getBudgetAlerts } from "lib/admin/teams";
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
    redirect("/sign-in");
  }

  const params = await searchParams;
  const days = parseInt(params.days ?? "30", 10);

  const [data, budgetAlerts] = await Promise.all([
    getUsageSummary({ days }),
    getBudgetAlerts(),
  ]);

  return (
    <div className="space-y-8">
      <BudgetAlertsWidget alerts={budgetAlerts} />
      <UsageTable data={data} />
    </div>
  );
}
