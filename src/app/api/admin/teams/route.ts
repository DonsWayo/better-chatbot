import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { getAdminTeams, createTeam } from "lib/admin/teams";
import { z } from "zod";

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/admin/teams
 *
 * List all teams with member counts and budget info. Admin-only.
 */
export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const teams = await getAdminTeams();
  return NextResponse.json({ teams });
}

/**
 * POST /api/admin/teams
 *
 * Create a new team. Admin-only.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = CreateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const team = await createTeam(parsed.data.name, parsed.data.description);
  return NextResponse.json({ team });
}
