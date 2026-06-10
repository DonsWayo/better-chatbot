import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";
import {
  WRITABLE_VISIBILITIES,
  normalizeWriteVisibility,
  resolveTeamIds,
} from "lib/knowledge/collections";
import {
  knowledgeCollectionEntity,
  loadViewerContext,
  resolveAccess,
} from "lib/visibility";

import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [collections, viewer] = await Promise.all([
    db.select().from(AsafeKnowledgeCollectionTable),
    loadViewerContext("knowledge_collection", session.user.id),
  ]);

  // Unified visibility model: only return collections the viewer can see.
  const visible = collections.filter((c) =>
    resolveAccess(
      knowledgeCollectionEntity(c),
      { ...viewer, grants: viewer.grantsByEntityId[c.id] ?? [] },
      "view",
    ),
  );

  return NextResponse.json({ collections: visible });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = await req.json() as {
    name: string;
    description?: string;
    visibility?: string;
    teamId?: string;
    teamIds?: string[];
  };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (body.visibility && !WRITABLE_VISIBILITIES.has(body.visibility)) {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }

  // teamIds[] is the source of truth; legacy single teamId stays synced to
  // teamIds[0] for back-compat readers.
  const teamIds = resolveTeamIds(body);

  const [collection] = await db.insert(AsafeKnowledgeCollectionTable).values({
    name: body.name,
    description: body.description ?? null,
    visibility: normalizeWriteVisibility(body.visibility ?? "company"),
    teamId: teamIds?.[0] ?? null,
    teamIds,
    createdBy: session.user.id,
  }).returning();

  return NextResponse.json({ collection });
}
