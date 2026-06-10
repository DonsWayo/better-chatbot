import { getSession } from "auth/server";
import { getSessionWithSteps } from "lib/agent-platform/sessions";
import { getIsUserAdmin } from "lib/user/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const result = await getSessionWithSteps(id);
  if (!result) {
    return new Response("Not Found", { status: 404 });
  }

  const isOwner = result.session.userId === session.user.id;
  if (!isOwner && !getIsUserAdmin(session.user)) {
    return new Response("Forbidden", { status: 403 });
  }

  return Response.json(result);
}
