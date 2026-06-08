import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeTeamMemberTable } from "@/lib/db/pg/schema.pg";
import { removeTeamMember } from "lib/admin/teams";
import { and, eq } from "drizzle-orm";

/**
 * DELETE /api/admin/teams/[id]/members/[memberId]
 *
 * Remove a member from a team. Admin-only.
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; memberId: string }> },
) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  // Verify the member belongs to this team
  const [member] = await db
    .select({ id: AsafeTeamMemberTable.id })
    .from(AsafeTeamMemberTable)
    .where(
      and(
        eq(AsafeTeamMemberTable.id, params.memberId),
        eq(AsafeTeamMemberTable.teamId, params.id),
      ),
    );

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await removeTeamMember(params.memberId);
  return NextResponse.json({ ok: true });
}
