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
  "asafe_presence",
  // Collaborative documents: the client subscribes with table=document and a
  // documentId; the proxy pins WHERE id = $1 and exposes only the CHANGE SIGNAL
  // (id, updated_at, last_edited_by, last_edited_at) — never the heavy content.
  "document",
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

/**
 * Presence (phase 3). Contexts a heartbeat can target — mirrors the
 * `context_type` enum on asafe_presence. Shared by the Server Action, the
 * shape proxy, and the client island so all three agree on the vocabulary.
 */
export const PRESENCE_CONTEXT_TYPES = [
  "thread",
  "folder",
  // Collaborative documents: a viewer/editor on /documents/[id] heartbeats with
  // context_type='document', context_id=<documentId uuid>. Gated by
  // documentRepository.checkAccess (read) in the heartbeat action + shape proxy
  // — the same ACL as the document shape itself.
  "document",
] as const;

export type PresenceContextType = (typeof PRESENCE_CONTEXT_TYPES)[number];

export function isPresenceContextType(
  value: string | null,
): value is PresenceContextType {
  return (
    value !== null &&
    (PRESENCE_CONTEXT_TYPES as readonly string[]).includes(value)
  );
}

/** Client heartbeat cadence while the tab is visible. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;

/** A user counts as "active" when their last heartbeat is within this window. */
export const PRESENCE_ACTIVE_WINDOW_MS = 90_000;

/**
 * Typing indicators ride the presence row (asafe_presence.typing): while a
 * user types in a shared context the composer sends heartbeat(typing=true) at
 * most once per throttle window, and one heartbeat(typing=false) after the
 * silence window (or on unmount/send). Readers only render the flag while
 * last_seen_at is within the display window, so a lost "clear" beat ages out
 * on its own.
 */

/** While typing continues, send at most one typing=true beat per this window. */
export const TYPING_BEAT_THROTTLE_MS = 4_000;

/** After this much keyboard silence, send a single typing=false clear beat. */
export const TYPING_SILENCE_CLEAR_MS = 5_000;

/** Readers show "is typing…" only while last_seen_at is within this window. */
export const TYPING_DISPLAY_WINDOW_MS = 10_000;

/**
 * Pure throttle decision for the typing beacon (unit-testable without timers):
 * beat immediately on the first keystroke, then at most once per
 * TYPING_BEAT_THROTTLE_MS while typing continues.
 */
export function shouldSendTypingBeat(
  nowMs: number,
  lastBeatAtMs: number | null,
): boolean {
  return (
    lastBeatAtMs === null || nowMs - lastBeatAtMs >= TYPING_BEAT_THROTTLE_MS
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
