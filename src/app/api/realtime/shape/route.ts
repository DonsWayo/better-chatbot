import { getSession } from "auth/server";
import {
  ELECTRIC_PROTOCOL_QUERY_PARAMS,
  electricBaseUrl,
  isUuid,
} from "lib/realtime/shapes";
import { canReadThread } from "lib/teamspaces/folders";

export const dynamic = "force-dynamic";

/**
 * Authenticated proxy in front of the Electric sync service's HTTP shape API
 * (Electric "proxy auth" pattern: https://electric-sql.com/docs/guides/auth).
 *
 * Electric itself is unauthenticated and internal-only; this route is the ONLY
 * way browsers may subscribe to a shape. It:
 *   1. requires a session (401 otherwise);
 *   2. only serves the whitelisted shapes below (403 for any other table);
 *   3. pins `where`/`params` SERVER-SIDE from the session + team ACLs — the
 *      client can never widen a shape, only pick which whitelisted one;
 *   4. forwards only the Electric shape-log protocol params (offset, handle,
 *      live, cursor, live_sse) and streams the response straight through,
 *      preserving the electric-* headers the client protocol depends on.
 *
 * Whitelisted shapes:
 *   - table=chat_message&threadId=<uuid>  → WHERE thread_id = $1, gated by
 *     canReadThread (owner, or team-visible thread in a team folder the
 *     caller is a member of). Powers the live shared-thread view.
 *   - table=agent_session                 → WHERE user_id = <caller>. Powers
 *     live run/badge updates for the caller's own sessions.
 */
export async function GET(request: Request) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const table = url.searchParams.get("table");

  const originUrl = new URL("/v1/shape", electricBaseUrl());
  for (const param of ELECTRIC_PROTOCOL_QUERY_PARAMS) {
    const value = url.searchParams.get(param);
    if (value !== null) {
      originUrl.searchParams.set(param, value);
    }
  }

  if (table === "chat_message") {
    const threadId = url.searchParams.get("threadId");
    if (!threadId || !isUuid(threadId)) {
      return new Response("threadId (uuid) is required", { status: 400 });
    }
    if (!(await canReadThread(threadId, userId))) {
      return new Response("Forbidden", { status: 403 });
    }
    originUrl.searchParams.set("table", "chat_message");
    originUrl.searchParams.set("where", `"thread_id" = $1`);
    originUrl.searchParams.set("params[1]", threadId);
    // The live island only needs a change signal; keep the log payload tiny.
    originUrl.searchParams.set("columns", "id,created_at");
  } else if (table === "agent_session") {
    originUrl.searchParams.set("table", "agent_session");
    originUrl.searchParams.set("where", `"user_id" = $1`);
    originUrl.searchParams.set("params[1]", userId);
  } else {
    return new Response("Shape not allowed", { status: 403 });
  }

  const response = await fetch(originUrl);

  // fetch() decompresses the body but keeps content-encoding/content-length,
  // which would break decoding in the browser (whatwg/fetch#1729). Everything
  // else — notably the electric-* protocol headers — passes through untouched.
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  // Responses are per-session (ACL-scoped): never let a shared cache store them.
  const cacheControl = headers.get("cache-control");
  headers.set(
    "cache-control",
    cacheControl ? cacheControl.replace("public", "private") : "private",
  );
  headers.append("vary", "cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
