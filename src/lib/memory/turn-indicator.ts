// ---------------------------------------------------------------------------
// Pure decision helpers for the in-chat "Memory updated" indicator
// (components/memory/memory-updated-pill.tsx). Deliberately NOT server-only:
// these run in the chat client. Implicit memory extraction is fire-and-forget
// AFTER the response stream (lib/memory/extract.ts), so the chat response
// cannot carry a "memory stored" signal — the client instead checks
// GET /api/memory?since=<turn start> a couple of times after the turn settles.
// ---------------------------------------------------------------------------

/**
 * Delays (ms after the stream settles) for the at-most-two follow-up checks.
 * No polling beyond these — the manager page is the authoritative surface.
 */
export const MEMORY_CHECK_DELAYS_MS: readonly number[] = [4_000, 10_000];

/** Chat statuses during which a turn is in flight (`useChat` status values). */
export function isTurnActiveStatus(status: string): boolean {
  return status === "submitted" || status === "streaming";
}

/** True exactly on the in-flight → ready transition that ends a turn. */
export function turnJustCompleted(prev: string, next: string): boolean {
  return isTurnActiveStatus(prev) && next === "ready" && prev !== next;
}

/** Defensive count of `memories` in a GET /api/memory response payload. */
export function countNewMemories(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const memories = (payload as { memories?: unknown }).memories;
  return Array.isArray(memories) ? memories.length : 0;
}
