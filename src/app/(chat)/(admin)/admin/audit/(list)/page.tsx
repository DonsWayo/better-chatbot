import { redirect, unauthorized } from "next/navigation";
import { requireAdminPermission } from "auth/permissions";
import { getSession } from "lib/auth/server";
import { getAuditLog, AUDIT_EVENT_TYPES } from "lib/admin/audit";
import { AuditLogTable } from "@/components/admin/audit-log-table";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    eventType?: string;
    userId?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const limit = 50;
  const eventType = params.eventType ?? undefined;
  const userId = params.userId ?? undefined;
  const fromParam = params.from;
  const toParam = params.to;
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  const { rows, total } = await getAuditLog({ page, limit, eventType, userId, from, to });

  return (
    <AuditLogTable
      rows={rows}
      total={total}
      page={page}
      limit={limit}
      eventTypes={[...AUDIT_EVENT_TYPES]}
      filters={{ eventType, userId, from: fromParam, to: toParam }}
    />
  );
}
