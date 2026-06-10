import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";
import {
  WRITABLE_VISIBILITIES,
  normalizeWriteVisibility,
  resolveTeamIds,
} from "lib/knowledge/collections";
import { canAccess } from "lib/visibility";
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

  // Unified visibility model: enforce read access (owner/admin/team/company/grants).
  const allowed = await canAccess(
    "knowledge_collection",
    params.id,
    session.user.id,
    "view",
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ collection });
}

export async function PATCH(
  request: NextRequest,
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

  // Owner and org admins hold manage on the unified model.
  const allowed = await canAccess(
    "knowledge_collection",
    params.id,
    session.user.id,
    "manage",
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string | null;
    visibility?: string;
    teamId?: string | null;
    teamIds?: string[] | null;
  };

  if (body.visibility && !WRITABLE_VISIBILITIES.has(body.visibility)) {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }
  if (body.name !== undefined && !body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const update: Partial<
    typeof AsafeKnowledgeCollectionTable.$inferInsert
  > = { updatedAt: new Date() };
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.visibility !== undefined) {
    update.visibility = normalizeWriteVisibility(body.visibility);
  }
  if (body.teamIds !== undefined || body.teamId !== undefined) {
    // teamIds[] is the source of truth; legacy teamId stays synced to teamIds[0].
    const teamIds = resolveTeamIds(body);
    update.teamIds = teamIds;
    update.teamId = teamIds?.[0] ?? null;
  }

  const [updated] = await db
    .update(AsafeKnowledgeCollectionTable)
    .set(update)
    .where(eq(AsafeKnowledgeCollectionTable.id, params.id))
    .returning();

  return NextResponse.json({ collection: updated });
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
