import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";

import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const collections = await db.select().from(AsafeKnowledgeCollectionTable);
  return NextResponse.json({ collections });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = await req.json() as { name: string; description?: string; visibility?: "team" | "org"; teamId?: string };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const [collection] = await db.insert(AsafeKnowledgeCollectionTable).values({
    name: body.name,
    description: body.description ?? null,
    visibility: body.visibility ?? "org",
    teamId: body.teamId ?? null,
    createdBy: session.user.id,
  }).returning();

  return NextResponse.json({ collection });
}
