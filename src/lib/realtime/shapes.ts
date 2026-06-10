/**
 * Realtime read-path sync via ElectricSQL (phase 2 of the realtime plan —
 * docs/next-gen-platform-blueprint.md "Realtime & collaboration").
 *
 * Electric streams READS only: every write still goes through the existing
 * routes/server actions. The Electric HTTP shape API is unauthenticated, so it
 * is NEVER exposed to clients directly — all browser subscriptions go through
 * the authenticated proxy at /api/realtime/shape, which only allows the
 * whitelisted shapes below and pins the WHERE clause server-side.
 */

/** Proxy endpoint browsers subscribe to (see src/app/api/realtime/shape/route.ts). */
export const SHAPE_PROXY_PATH = "/api/realtime/shape";

/**
 * Electric shape-log protocol params the client adds and the proxy forwards
 * verbatim. Everything else (table, where, params, columns) is decided
 * server-side from the session — clients can never widen a shape.
 * Ref: https://electric-sql.com/docs/guides/auth (proxy auth pattern).
 */
export const ELECTRIC_PROTOCOL_QUERY_PARAMS = [
  "offset",
  "handle",
  "live",
  "cursor",
  "live_sse",
] as const;

/** Tables the proxy will serve shapes for. Anything else is rejected with 403. */
export const WHITELISTED_SHAPE_TABLES = [
  "chat_message",
  "agent_session",
] as const;

export type WhitelistedShapeTable = (typeof WHITELISTED_SHAPE_TABLES)[number];

export function isWhitelistedShapeTable(
  table: string | null,
): table is WhitelistedShapeTable {
  return (
    table !== null &&
    (WHITELISTED_SHAPE_TABLES as readonly string[]).includes(table)
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** chat_thread.id / user.id are uuid columns; reject garbage before it hits SQL. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Base URL of the Electric sync service (internal-only; dev compose maps host :3010). */
export function electricBaseUrl(): string {
  return process.env.ELECTRIC_URL || "http://localhost:3010";
}
