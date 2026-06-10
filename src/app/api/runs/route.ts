import { getSession } from "auth/server";
import { listSessionsForUser } from "lib/agent-platform/sessions";

export async function GET() {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sessions = await listSessionsForUser(session.user.id, { limit: 30 });
  return Response.json(sessions);
}
