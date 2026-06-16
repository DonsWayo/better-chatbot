import { getSession } from "lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafePromptTemplateTable } from "@/lib/db/pg/schema.pg";
import { listUserTeams } from "lib/teamspaces/folders";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";

const PROMPT_VISIBILITIES = new Set(["private", "team", "org"]);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // v1: return org-wide prompts + user's own prompts
  // Team-visibility filtering can be added when team membership lookup is built out
  const prompts = await db
    .select()
    .from(AsafePromptTemplateTable)
    .where(
      or(
        eq(AsafePromptTemplateTable.visibility, "org"),
        eq(AsafePromptTemplateTable.authorId, userId),
      ),
    )
    .orderBy(AsafePromptTemplateTable.createdAt);

  return NextResponse.json(prompts);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    title: string;
    description?: string;
    content: string;
    category?: string;
    visibility?: "private" | "team" | "org";
    teamId?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  // Reject unknown visibility values rather than writing them verbatim.
  if (body.visibility !== undefined && !PROMPT_VISIBILITIES.has(body.visibility)) {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }
  // A caller may only attach a prompt to a team they belong to (else they could
  // inject a prompt into an arbitrary team's library).
  if (body.teamId) {
    const teams = await listUserTeams(session.user.id);
    if (!teams.some((t) => t.id === body.teamId)) {
      return NextResponse.json(
        { error: "You are not a member of that team" },
        { status: 403 },
      );
    }
  }

  const [created] = await db
    .insert(AsafePromptTemplateTable)
    .values({
      title: body.title.trim(),
      description: body.description ?? null,
      content: body.content.trim(),
      category: body.category ?? null,
      visibility: body.visibility ?? "private",
      teamId: body.teamId ?? null,
      authorId: session.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
