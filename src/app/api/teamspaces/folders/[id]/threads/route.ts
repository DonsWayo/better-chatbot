import { getSession } from "auth/server";
import { listThreadsInFolder } from "lib/teamspaces/folders";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  try {
    const threads = await listThreadsInFolder(id, session.user.id);
    return Response.json(threads);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    if (message === "Folder not found") {
      return new Response(message, { status: 404 });
    }
    return new Response(message, { status: 403 });
  }
}
