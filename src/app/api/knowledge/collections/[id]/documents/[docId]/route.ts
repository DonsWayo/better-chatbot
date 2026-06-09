import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeDocumentChunkTable,
  AsafeKnowledgeCollectionTable,
} from "@/lib/db/pg/schema.pg";
import { and, eq } from "drizzle-orm";

/**
 * DELETE /api/knowledge/collections/[id]/documents/[docId]
 *
 * Deletes all chunks belonging to a document (identified by base64url-encoded sourceRef).
 * Admin-only — editors and regular users get 403.
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; docId: string }> },
) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const [collection] = await db
    .select({ id: AsafeKnowledgeCollectionTable.id })
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, params.id));

  if (!collection) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  // Decode the base64url sourceRef
  let sourceRef: string;
  try {
    sourceRef = Buffer.from(params.docId, "base64url").toString("utf8");
  } catch {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const result = await db
    .delete(AsafeDocumentChunkTable)
    .where(
      and(
        eq(AsafeDocumentChunkTable.collectionId, params.id),
        eq(AsafeDocumentChunkTable.sourceRef, sourceRef),
      ),
    )
    .returning({ id: AsafeDocumentChunkTable.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deletedChunks: result.length });
}
