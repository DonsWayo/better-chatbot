/**
 * Near-live shared generation (v1) — see
 * content/docs/collaboration/realtime.mdx "Near-live shared generation".
 *
 * While the owner of a TEAM-SHARED thread is generating, the chat route
 * persists the in-progress assistant text on a throttle (same message id the
 * final onFinish persist will use). Each partial upsert flows through the
 * existing Electric chat_message shape, so teammates' read-only views
 * (src/components/realtime/live-thread-messages.tsx → router.refresh) see the
 * response grow during generation instead of only after it finishes.
 *
 * Invariants:
 * - Non-shared and temporary threads: ZERO extra writes (the shared gate
 *   resolves once, lazily, off the hot path).
 * - Partial writes are fire-and-forget; a failure can never break the stream.
 * - The final onFinish persist overwrites parts AND metadata, clearing the
 *   `streaming` flag. If a process dies mid-stream, the flag ages out
 *   client-side via STREAMING_FLAG_STALE_MS (no cleanup job needed).
 *
 * Everything here is pure / injectable so it can be unit-tested without
 * timers, the DB, or the AI SDK.
 */

/** Minimum gap between two partial persists of the in-progress message. */
export const PARTIAL_PERSIST_INTERVAL_MS = 2_500;

/**
 * A `streaming: true` flag older than this is treated as a leftover from a
 * crashed stream and NOT rendered as "generating…". Partials are written at
 * least every PARTIAL_PERSIST_INTERVAL_MS while generation is live, so two
 * minutes is generous slack.
 */
export const STREAMING_FLAG_STALE_MS = 120_000;

/**
 * Pure throttle decision (no timers): persist on the first opportunity, then
 * at most once per interval.
 */
export function shouldPersistPartial(
  lastWriteAtMs: number | null,
  nowMs: number,
  intervalMs: number = PARTIAL_PERSIST_INTERVAL_MS,
): boolean {
  return lastWriteAtMs === null || nowMs - lastWriteAtMs >= intervalMs;
}

/**
 * Reader-side check for the "generating…" indicator: the message is mid-stream
 * AND the flag is fresh (stale flags from crashed streams age out on their
 * own — the indicator must never get stuck).
 */
export function isActivelyStreaming(
  metadata: { streaming?: boolean; streamingAt?: number } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (metadata?.streaming !== true) return false;
  if (typeof metadata.streamingAt !== "number") return false;
  return nowMs - metadata.streamingAt <= STREAMING_FLAG_STALE_MS;
}

export interface PartialPersisterOptions {
  /**
   * Resolves whether the thread is team-shared. Called lazily, exactly once,
   * on the first appended chunk (never on the request hot path). A rejection
   * is treated as "not shared" — fail closed, zero extra writes.
   */
  isShared: () => Promise<boolean>;
  /** Upserts the in-progress assistant message with the accumulated text. */
  persist: (accumulatedText: string) => Promise<unknown>;
  intervalMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Persist failures land here (logging); they are never re-thrown. */
  onError?: (error: unknown) => void;
}

export interface PartialPersister {
  /** Feed one text delta from the model stream. Synchronous, never throws. */
  append(textDelta: string): void;
}

/**
 * Accumulates streamed text and fires throttled, fire-and-forget partial
 * persists — but only after `isShared` has resolved `true`. Until the gate
 * resolves (or when it resolves false / rejects) appends only buffer text.
 */
export function createPartialPersister(
  options: PartialPersisterOptions,
): PartialPersister {
  const intervalMs = options.intervalMs ?? PARTIAL_PERSIST_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const onError = options.onError ?? (() => {});

  let buffer = "";
  let lastWriteAtMs: number | null = null;
  let shared: boolean | null = null;
  let gateStarted = false;

  return {
    append(textDelta: string) {
      buffer += textDelta;
      if (!gateStarted) {
        gateStarted = true;
        try {
          options
            .isShared()
            .then((value) => {
              shared = value === true;
            })
            .catch(() => {
              shared = false;
            });
        } catch {
          shared = false;
        }
      }
      if (shared !== true) return;
      if (buffer.length === 0) return;
      const nowMs = now();
      if (!shouldPersistPartial(lastWriteAtMs, nowMs, intervalMs)) return;
      lastWriteAtMs = nowMs;
      try {
        Promise.resolve(options.persist(buffer)).catch(onError);
      } catch (error) {
        onError(error);
      }
    },
  };
}
