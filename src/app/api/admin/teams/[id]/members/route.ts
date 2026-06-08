import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable, AsafeTeamTable } from "@/lib/db/pg/schema.pg";
import { addTeamMember } from "lib/admin/teams";
import { eq } from "drizzle-orm";
import { z } from "zod";

const AddMemberSchema = z.object({
  email: z.string().email().optional(),
  userId: z.string().uuid().optional(),
  role: z.enum(["admin", "editor", "member"]).default("member"),
}).refine((d) => d.email || d.userId, { message: "email or userId required" });

/**
 * POST /api/admin/teams/[id]/members
 *
 * Add a user to a team by email or userId. Admin-only.
 * Idempotent — re-adding an existing member updates their role.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const [team] = await db
    .select({ id: AsafeTeamTable.id })
    .from(AsafeTeamTable)
    .where(eq(AsafeTeamTable.id, params.id));
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  // Resolve userId from email if not provided directly
  let userId = parsed.data.userId;
  if (!userId && parsed.data.email) {
    const [user] = await db
      .select({ id: UserTable.id })
      .from(UserTable)
      .where(eq(UserTable.email, parsed.data.email));
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    userId = user.id;
  }

  await addTeamMember(params.id, userId!, parsed.data.role);
  return NextResponse.json({ ok: true });
}
