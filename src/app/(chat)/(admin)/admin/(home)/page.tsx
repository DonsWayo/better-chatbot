import { redirect, unauthorized } from "next/navigation";
import { requireAdminPermission } from "auth/permissions";
import { getSession } from "lib/auth/server";
import { getDashboardStats } from "lib/admin/dashboard";
import { getBudgetAlerts } from "lib/admin/teams";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [stats, budgetAlerts] = await Promise.all([
    getDashboardStats(),
    getBudgetAlerts(),
  ]);

  return <AdminDashboard stats={stats} budgetAlerts={budgetAlerts} />;
}
