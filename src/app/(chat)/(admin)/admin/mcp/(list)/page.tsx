import { CompanyMcpTable } from "@/components/admin/company-mcp-table";
import { inArray } from "drizzle-orm";
import { getAdminTeams } from "lib/admin/teams";
import { requireAdminPermission } from "lib/auth/permissions";
import { pgDb as db } from "lib/db/pg/db.pg";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminMcpPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const [servers, teams] = await Promise.all([
    db
      .select()
      .from(McpServerTable)
      .where(inArray(McpServerTable.scope, ["org", "team"])),
    getAdminTeams(),
  ]);

  return (
    <CompanyMcpTable
      servers={servers}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
