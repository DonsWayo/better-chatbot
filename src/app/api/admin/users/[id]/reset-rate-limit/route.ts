import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb } from "lib/db/pg/db.pg";
import { AsafeRateLimitBucketTable } from "lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/admin/users/[id]/reset-rate-limit
 *
 * Clears all rate-limit buckets for the specified user.
 * Use when a user accidentally hits their rate limit and needs immediate access.
 * Admin-only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: userId } = await params;
  if (!userId) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const deleted = await pgDb
    .delete(AsafeRateLimitBucketTable)
    .where(eq(AsafeRateLimitBucketTable.userId, userId))
    .returning();

  return NextResponse.json({ success: true, deleted: deleted.length });
}
