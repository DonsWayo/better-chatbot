import { getSession } from "auth/server";
import { listFoldersForUser, listUserTeams } from "lib/teamspaces/folders";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const [folders, teams] = await Promise.all([
    listFoldersForUser(userId),
    listUserTeams(userId),
  ]);
  return Response.json({ userId, folders, teams });
}
