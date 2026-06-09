import { KnowledgeTable } from "@/components/admin/knowledge-table";
import { requireAdminPermission } from "lib/auth/permissions";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";
import { redirect, unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function KnowledgeListPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const collections = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .orderBy(AsafeKnowledgeCollectionTable.createdAt);

  return <KnowledgeTable collections={collections} />;
}
