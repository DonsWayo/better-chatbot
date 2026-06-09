import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { eraseUserData } from "lib/compliance/gdpr";

/**
 * POST /api/admin/users/[id]/erasure
 *
 * GDPR Article 17 — right to erasure ("right to be forgotten"). Anonymises
 * the user profile and deletes personal-data rows. The user account record is
 * retained (tombstoned) so FK constraints hold and the erasure audit record
 * remains meaningful.
 *
 * Admin-only. Irreversible — confirm before calling.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: userId } = await params;

  // Prevent admins from erasing themselves
  if (userId === session.user.id) {
    return NextResponse.json({ error: "Cannot erase your own account via this endpoint." }, { status: 400 });
  }

  const result = await eraseUserData(userId);
  return NextResponse.json({ ok: true, userId, ...result });
}
