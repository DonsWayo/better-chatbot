import { AdminSidebar } from "@/components/layouts/admin-sidebar";
import { requireAdminPermission } from "auth/permissions";
import { unauthorized } from "next/navigation";
import type { ReactNode } from "react";

// Admin console mode-swap: the daily sidebar hides itself on /admin/* and
// this layout renders the dedicated admin left nav instead.
// docs/design/information-architecture.md §3.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <AdminSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
