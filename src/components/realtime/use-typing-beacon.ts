"use client";

import { heartbeatPresenceAction } from "lib/realtime/presence-actions";
import {
  type PresenceContextType,
  TYPING_SILENCE_CLEAR_MS,
  shouldSendTypingBeat,
} from "lib/realtime/shapes";
import { useCallback, useEffect, useRef } from "react";

/**
 * Typing beacon (rides the presence row — see
 * content/docs/collaboration/realtime.mdx#typing-indicators).
 *
 * Call `onTyping()` from the composer on every input event. The hook turns
 * that firehose into at most one heartbeat(typing=true) per 4s
 * (TYPING_BEAT_THROTTLE_MS via the pure `shouldSendTypingBeat` helper), plus a
 * single heartbeat(typing=false) after 5s of silence (TYPING_SILENCE_CLEAR_MS),
 * on `stopTyping()` (e.g. message send), or on unmount/context change.
 *
 * `enabled` gates everything client-side: pass the same "is this context
 * shared" signal that gates the presence avatars, so private threads never
 * emit typing beats. The Server Action re-checks access regardless.
 */
export function useTypingBeacon(
  contextType: PresenceContextType,
  contextId: string,
  enabled: boolean,
): { onTyping: () => void; stopTyping: () => void } {
  const lastBeatAtRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    lastBeatAtRef.current = null;
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    heartbeatPresenceAction(contextType, contextId, false).catch(() => {
      // Best-effort chrome — a lost clear ages out of the 10s display window.
    });
  }, [contextType, contextId]);

  const onTyping = useCallback(() => {
    if (!enabled) return;
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(stopTyping, TYPING_SILENCE_CLEAR_MS);
    const now = Date.now();
    if (!shouldSendTypingBeat(now, lastBeatAtRef.current)) return;
    lastBeatAtRef.current = now;
    isTypingRef.current = true;
    heartbeatPresenceAction(contextType, contextId, true).catch(() => {
      // Best-effort chrome; never surface beacon failures.
    });
  }, [enabled, contextType, contextId, stopTyping]);

  // Clear the flag when the context changes, the gate closes, or we unmount.
  useEffect(() => stopTyping, [stopTyping, enabled]);

  return { onTyping, stopTyping };
}
