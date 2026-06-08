import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeDocumentChunkTable,
  AsafeKnowledgeCollectionTable,
} from "@/lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";

/**
 * GET /api/knowledge/collections/[id]/documents
 *
 * Returns unique source documents (grouped by sourceRef) within a collection.
 * Any authenticated user can list documents; upload/delete is admin-only.
 */
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [collection] = await db
    .select({ id: AsafeKnowledgeCollectionTable.id })
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, params.id));

  if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Group chunks by sourceRef to surface one entry per document
  const rows = await db
    .select({
      sourceRef: AsafeDocumentChunkTable.sourceRef,
      chunkCount: sql<number>`cast(count(*) as int)`,
      createdAt: sql<string>`min(${AsafeDocumentChunkTable.createdAt})`,
    })
    .from(AsafeDocumentChunkTable)
    .where(eq(AsafeDocumentChunkTable.collectionId, params.id))
    .groupBy(AsafeDocumentChunkTable.sourceRef)
    .orderBy(sql`min(${AsafeDocumentChunkTable.createdAt}) desc`);

  const documents = rows.map((r) => ({
    // stable id: base64url of sourceRef for use in the DELETE endpoint
    id: Buffer.from(r.sourceRef).toString("base64url"),
    sourceRef: r.sourceRef,
    chunkCount: r.chunkCount,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ documents });
}
