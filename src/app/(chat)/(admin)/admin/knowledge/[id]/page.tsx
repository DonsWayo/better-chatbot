import { notFound, redirect, unauthorized } from "next/navigation";
import { requireAdminPermission } from "lib/auth/permissions";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeDocumentChunkTable,
  AsafeKnowledgeCollectionTable,
} from "lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";
import { KnowledgeCollectionDetail } from "@/components/admin/knowledge-collection-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function KnowledgeCollectionPage({ params }: PageProps) {
  try {
    await requireAdminPermission();
  } catch {
    unauthorized();
  }

  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const [collection] = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, id));

  if (!collection) notFound();

  const documents = await db
    .select({
      sourceRef: AsafeDocumentChunkTable.sourceRef,
      chunkCount: sql<number>`cast(count(*) as int)`,
      createdAt: sql<string>`min(${AsafeDocumentChunkTable.createdAt})`,
    })
    .from(AsafeDocumentChunkTable)
    .where(eq(AsafeDocumentChunkTable.collectionId, id))
    .groupBy(AsafeDocumentChunkTable.sourceRef)
    .orderBy(sql`min(${AsafeDocumentChunkTable.createdAt}) desc`);

  const docs = documents.map((d) => ({
    id: Buffer.from(d.sourceRef).toString("base64url"),
    sourceRef: d.sourceRef,
    chunkCount: d.chunkCount,
    createdAt: d.createdAt,
  }));

  return (
    <KnowledgeCollectionDetail
      collection={collection}
      initialDocuments={docs}
    />
  );
}
