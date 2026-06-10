import { getSession } from "auth/server";
import { inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import { isUuid } from "lib/realtime/shapes";

export const dynamic = "force-dynamic";

/**
 * Resolves presence user ids → display name + avatar for the presence avatar
 * stack (the asafe_presence shape deliberately carries only user_id).
 *
 * Authenticated-only, same exposure level as existing member lists: name and
 * image only — never emails, roles, or anything else off the user row.
 */
const MAX_IDS = 50;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const idsParam = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(idsParam.split(",").map((id) => id.trim()))].filter(
    isUuid,
  );

  if (ids.length === 0) {
    return Response.json({ users: [] });
  }
  if (ids.length > MAX_IDS) {
    return new Response("Too many ids", { status: 400 });
  }

  const users = await db
    .select({
      id: UserTable.id,
      name: UserTable.name,
      image: UserTable.image,
    })
    .from(UserTable)
    .where(inArray(UserTable.id, ids));

  return Response.json({ users });
}
