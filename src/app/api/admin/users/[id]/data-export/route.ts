import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { exportUserData } from "lib/compliance/gdpr";

/**
 * GET /api/admin/users/[id]/data-export
 *
 * GDPR Article 20 — data portability. Exports all personal data held for a
 * user as a JSON blob that an admin can provide to a data-subject access
 * request (DSAR).
 *
 * Admin-only. Do not expose to end-users directly (use /api/user/export).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: userId } = await params;
  const data = await exportUserData(userId);

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="gdpr-export-${userId}.json"`,
    },
  });
}
