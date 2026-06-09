import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [collection] = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, params.id));

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ collection });
}

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [collection] = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, params.id));

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  await db
    .delete(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, params.id));

  return NextResponse.json({ ok: true });
}
