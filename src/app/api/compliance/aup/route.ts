import { NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable } from "@/lib/db/pg/schema.pg";
import { writeAuditLog } from "lib/compliance/audit";
import { eq } from "drizzle-orm";

/**
 * POST /api/compliance/aup
 *
 * Record that the current user has accepted the Acceptable Use Policy.
 * EU AI Act Article 50 — inform users they interact with AI.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  await db
    .update(UserTable)
    .set({ acceptedAupAt: now })
    .where(eq(UserTable.id, session.user.id));

  void writeAuditLog({
    userId: session.user.id,
    eventType: "aup_accepted",
    details: { acceptedAt: now.toISOString() },
  });

  return NextResponse.json({ ok: true, acceptedAt: now.toISOString() });
}

/**
 * GET /api/compliance/aup
 *
 * Check if the current user has accepted the AUP.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db
    .select({ acceptedAupAt: UserTable.acceptedAupAt })
    .from(UserTable)
    .where(eq(UserTable.id, session.user.id))
    .limit(1);

  return NextResponse.json({ accepted: !!user?.acceptedAupAt, acceptedAt: user?.acceptedAupAt ?? null });
}
