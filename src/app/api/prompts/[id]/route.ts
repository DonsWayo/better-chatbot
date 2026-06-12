import { getSession } from "lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafePromptTemplateTable } from "@/lib/db/pg/schema.pg";
import { listUserTeams } from "lib/teamspaces/folders";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";

  const [prompt] = await db
    .select()
    .from(AsafePromptTemplateTable)
    .where(eq(AsafePromptTemplateTable.id, id));

  if (!prompt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // GET previously returned ANY prompt by id, including other users' private
  // prompts (live-proven IDOR). Apply the same visibility gate the rest of the
  // app uses: author or admin always; "org" visible to everyone; "team"
  // visible only to members of the prompt's team. Otherwise 404 (don't leak
  // existence of private prompts).
  const isAuthor = prompt.authorId === userId;
  let canView = isAuthor || isAdmin || prompt.visibility === "org";
  if (!canView && prompt.visibility === "team" && prompt.teamId) {
    const teams = await listUserTeams(userId);
    canView = teams.some((t) => t.id === prompt.teamId);
  }
  if (!canView) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(prompt);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";

  const [existing] = await db
    .select()
    .from(AsafePromptTemplateTable)
    .where(eq(AsafePromptTemplateTable.id, id));

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.authorId !== userId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Partial<{
    title: string;
    description: string;
    content: string;
    category: string;
    visibility: "private" | "team" | "org";
    isFeatured: boolean;
    teamId: string;
  }>;

  const [updated] = await db
    .update(AsafePromptTemplateTable)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.visibility !== undefined && { visibility: body.visibility }),
      ...(body.isFeatured !== undefined && { isFeatured: body.isFeatured }),
      ...(body.teamId !== undefined && { teamId: body.teamId }),
      updatedAt: new Date(),
    })
    .where(eq(AsafePromptTemplateTable.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";

  const [existing] = await db
    .select()
    .from(AsafePromptTemplateTable)
    .where(eq(AsafePromptTemplateTable.id, id));

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.authorId !== userId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(AsafePromptTemplateTable)
    .where(and(eq(AsafePromptTemplateTable.id, id)));

  return NextResponse.json({ ok: true });
}
