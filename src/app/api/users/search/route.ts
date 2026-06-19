import { getSession } from "auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import { ilike, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/search?q=<query>
 * Returns up to 20 org members whose display name or email matches the query.
 * Used by the @mention picker in document comments. Returns only id/name/image
 * — never email — so callers can't enumerate the full user directory.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const pattern = `%${q}%`;

  const users = await db
    .select({
      id: UserTable.id,
      name: UserTable.name,
      image: UserTable.image,
    })
    .from(UserTable)
    .where(
      q.length > 0
        ? or(
            ilike(UserTable.name, pattern),
            ilike(sql`coalesce(${UserTable.email},'')`, pattern),
          )
        : sql`true`,
    )
    .limit(20)
    .orderBy(UserTable.name);

  return NextResponse.json({ users });
}
