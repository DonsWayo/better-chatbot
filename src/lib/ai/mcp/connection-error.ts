/**
 * MCP connection / transport error classification.
 *
 * When a user saves an MCP connector with an unreachable, mistyped, or
 * otherwise non-responsive URL, the transport layer (SSE / streamable-HTTP /
 * stdio) throws a raw error whose message leaks internal detail —
 * `connect ECONNREFUSED ::1:19999`, `fetch failed`, `SSE error: TypeError ...`,
 * the host/port, even a stack-class name. That is a CLIENT/VALIDATION error
 * (the server they pointed us at isn't reachable), not a server bug, and we
 * must not surface the raw transport string to the caller.
 *
 * `isMcpConnectionError` detects these transport failures so the create path
 * can map them to a clean 4xx with a user-safe message instead of a 500 that
 * leaks internals.
 */

/** User-safe message returned for any unreachable / failed-to-connect server. */
export const MCP_CONNECTION_ERROR_MESSAGE =
  "Could not connect to the MCP server at that URL. Check the URL is reachable.";

/**
 * Substrings that identify a connection / transport failure (vs. an
 * application-level validation or authorization error). Matched
 * case-insensitively against the full error chain message.
 */
const TRANSPORT_ERROR_SIGNATURES = [
  "econnrefused",
  "econnreset",
  "enotfound",
  "etimedout",
  "ehostunreach",
  "enetunreach",
  "eai_again", // DNS lookup temporary failure
  "fetch failed",
  "sse error",
  "socket hang up",
  "network error",
  "request timed out",
  "connection refused",
  "connection timeout",
  "connect timeout",
  "timeout", // generic transport timeout
  "und_err", // undici error codes (UND_ERR_CONNECT_TIMEOUT, etc.)
  "getaddrinfo",
];

/**
 * Walk the error `cause` chain and collect every message, so a wrapper like
 * `SSE error: ...` whose underlying `cause` is the real `fetch failed` /
 * `ECONNREFUSED` is still classified correctly.
 */
function collectErrorMessages(error: unknown, depth = 0): string {
  if (depth > 8 || error == null) return "";
  let msg = "";
  if (error instanceof Error) {
    msg = `${error.name ?? ""} ${error.message ?? ""}`;
    const cause = (error as { cause?: unknown }).cause;
    if (cause && cause !== error) {
      msg += ` ${collectErrorMessages(cause, depth + 1)}`;
    }
  } else if (typeof error === "string") {
    msg = error;
  } else {
    try {
      msg = String(error);
    } catch {
      msg = "";
    }
  }
  return msg;
}

/**
 * True when `error` is a connection / transport failure (unreachable host,
 * refused connection, DNS failure, timeout, raw `fetch failed` / `SSE error`).
 * Used by the MCP create path to map such failures to a clean 4xx instead of
 * leaking the raw transport string.
 */
export function isMcpConnectionError(error: unknown): boolean {
  const haystack = collectErrorMessages(error).toLowerCase();
  if (!haystack.trim()) return false;
  return TRANSPORT_ERROR_SIGNATURES.some((sig) => haystack.includes(sig));
}
