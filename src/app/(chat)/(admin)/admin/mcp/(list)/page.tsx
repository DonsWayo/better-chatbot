import { CompanyMcpTable } from "@/components/admin/company-mcp-table";
import { requireAdminPermission } from "lib/auth/permissions";
import { pgDb as db } from "lib/db/pg/db.pg";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { inArray } from "drizzle-orm";
import { unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminMcpPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const servers = await db
    .select()
    .from(McpServerTable)
    .where(inArray(McpServerTable.scope, ["org", "team"]));

  return <CompanyMcpTable servers={servers} />;
}
