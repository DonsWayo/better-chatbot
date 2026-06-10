import { getSession } from "auth/server";
import { listSessionsForUser } from "lib/agent-platform/sessions";

// Filtered queries scan a deeper window before slicing back down to the
// default page size, since the filter is applied after the fetch
// (sessions.ts is read-only for this surface).
const DEFAULT_LIMIT = 30;
const FILTER_SCAN_LIMIT = 200;

export async function GET(request?: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Optional ?origin=schedule filter (Triage "Recent routine runs").
  // Default behavior (no param) is unchanged.
  const origin = request?.url
    ? new URL(request.url).searchParams.get("origin")
    : null;

  if (!origin) {
    const sessions = await listSessionsForUser(session.user.id, {
      limit: DEFAULT_LIMIT,
    });
    return Response.json(sessions);
  }

  const sessions = await listSessionsForUser(session.user.id, {
    limit: FILTER_SCAN_LIMIT,
  });
  return Response.json(
    sessions
      .filter((run) => run.originSurface === origin)
      .slice(0, DEFAULT_LIMIT),
  );
}
