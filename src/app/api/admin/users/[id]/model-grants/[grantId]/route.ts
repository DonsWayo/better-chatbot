import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { revokeUserModelGrant } from "lib/admin/user-grants";

type Params = { params: Promise<{ id: string; grantId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: userId, grantId } = await params;
  await revokeUserModelGrant(grantId, userId);
  return NextResponse.json({ ok: true });
}
