import { getSession } from "auth/server";
import {
  ELECTRIC_PROTOCOL_QUERY_PARAMS,
  electricBaseUrl,
  isPresenceContextType,
  isUuid,
} from "lib/realtime/shapes";
import { canAccessFolder, canReadThread } from "lib/teamspaces/folders";

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
 *   - table=asafe_presence&contextType=thread|folder&contextId=<uuid>
 *     → WHERE context_type = $1 AND context_id = $2, gated by the same access
 *     check as the context itself (canReadThread / canAccessFolder). Powers
 *     the presence avatar stack + typing indicators; columns are pinned to
 *     id,user_id,context_type,context_id,last_seen_at,typing (no PII beyond
 *     ids — names/avatars resolve via /api/realtime/presence-users).
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
    // The live island only needs a change signal; keep the log payload tiny
    // (never the heavy json[] parts column). `metadata` is included because
    // near-live shared generation bumps metadata.streamingAt on every
    // throttled partial persist — without it, in-place updates to a streaming
    // message would never reach the shape log.
    originUrl.searchParams.set("columns", "id,created_at,metadata");
  } else if (table === "agent_session") {
    originUrl.searchParams.set("table", "agent_session");
    originUrl.searchParams.set("where", `"user_id" = $1`);
    originUrl.searchParams.set("params[1]", userId);
  } else if (table === "asafe_presence") {
    const contextType = url.searchParams.get("contextType");
    const contextId = url.searchParams.get("contextId");
    if (!isPresenceContextType(contextType)) {
      return new Response("contextType (thread|folder) is required", {
        status: 400,
      });
    }
    if (!contextId || !isUuid(contextId)) {
      return new Response("contextId (uuid) is required", { status: 400 });
    }
    const allowed =
      contextType === "thread"
        ? await canReadThread(contextId, userId)
        : await canAccessFolder(contextId, userId);
    if (!allowed) {
      return new Response("Forbidden", { status: 403 });
    }
    originUrl.searchParams.set("table", "asafe_presence");
    originUrl.searchParams.set(
      "where",
      `"context_type" = $1 AND "context_id" = $2`,
    );
    originUrl.searchParams.set("params[1]", contextType);
    originUrl.searchParams.set("params[2]", contextId);
    // id (pk, required by Electric) + the change signal + the typing flag;
    // never emails or names.
    originUrl.searchParams.set(
      "columns",
      "id,user_id,context_type,context_id,last_seen_at,typing",
    );
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
