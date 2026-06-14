/**
 * Pure, framework-agnostic helpers backing the collaborative-document editor's
 * autosave + near-live sync. Kept out of the components so the timing-sensitive
 * decisions are unit-testable without React, timers, or a DOM.
 *
 * Two concerns live here:
 *   1. Autosave debounce/flush bookkeeping — should a queued save fire now?
 *   2. Near-live reconciliation — when the Electric change signal says someone
 *      else saved, do we silently refetch (clean editor) or show a
 *      non-destructive "reload" banner (dirty/focused editor)?
 */

/** Debounce window for autosave: coalesce keystrokes into one write. */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * After a local save, treat the editor as "settling" for this long: an Electric
 * signal that arrives within the window is almost certainly the echo of our own
 * write (last_edited_by === me handles the common case, but clock skew / a
 * second tab of the same user can blur it), so we ignore it.
 */
export const SELF_ECHO_GRACE_MS = 1500;

/**
 * How long the editor must be idle (no keystroke, not focused) before a remote
 * change is allowed to silently overwrite the local content. Below this, a
 * remote change shows the reload banner instead of clobbering in-progress work.
 */
export const REMOTE_APPLY_IDLE_MS = 2000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Stable stringify for change detection (ignores key order is NOT needed —
 *  TipTap emits a stable key order for a given document, so JSON.stringify is a
 *  sufficient and cheap dirty check). */
export function serializeDoc(content: unknown): string {
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

/**
 * Has the editor diverged from what the server last confirmed? Compares the
 * current title+content against the last-saved snapshot. Pure so the autosave
 * effect can decide whether a write is even needed.
 */
export function isDirty(
  current: { title: string; content: unknown },
  lastSaved: { title: string; content: unknown },
): boolean {
  return (
    current.title !== lastSaved.title ||
    serializeDoc(current.content) !== serializeDoc(lastSaved.content)
  );
}

export interface RemoteChange {
  /** last_edited_by from the change signal (uuid) or null. */
  lastEditedBy: string | null;
  /** last_edited_at epoch ms from the change signal, or null. */
  lastEditedAtMs: number | null;
}

export interface NearLiveState {
  /** The viewer's own user id. */
  selfUserId: string;
  /** Is the local editor dirty (unsaved local edits) right now? */
  editorDirty: boolean;
  /** Is the editor focused / actively being typed in right now? */
  editorFocused: boolean;
  /** ms since the last local keystroke (Infinity if never / long ago). */
  msSinceLastEdit: number;
  /** ms since the last local save completed (Infinity if none yet). */
  msSinceLastSave: number;
  /** last_edited_at we have already reconciled, epoch ms (or null). */
  appliedAtMs: number | null;
}

export type NearLiveDecision =
  | { action: "ignore"; reason: string }
  | { action: "refetch" }
  | {
      action: "banner";
      /**
       * True when the local editor has UNSAVED DIRTY edits at the moment a
       * newer remote version landed — i.e. the remote write has superseded
       * (overridden) the in-progress local work under last-write-wins. The UI
       * uses this to make the banner explicit about data loss ("Your unsaved
       * changes were overridden …") rather than the softer "updated by someone
       * else" message shown when the editor is merely focused / recently typed
       * but not actually dirty.
       */
      overridden: boolean;
    };

/**
 * Core near-live reconciliation decision (last-write-wins, non-destructive):
 *
 *   - ignore  — the signal is our own write (lastEditedBy === me), is older than
 *               what we already applied, or arrived inside the self-echo grace
 *               just after our own save;
 *   - refetch — another user saved AND the local editor is clean and idle, so we
 *               can silently pull their version in (last-write-wins);
 *   - banner  — another user saved BUT the local editor is dirty or focused or
 *               recently edited, so overwriting would clobber in-progress work;
 *               show a non-destructive reload banner instead. When the editor is
 *               actually dirty, `overridden` is true so the UI can warn the
 *               losing writer that their unsaved changes were superseded.
 *
 * Pure: callers feed it observable state and act on the returned action.
 */
export function decideNearLive(
  change: RemoteChange,
  state: NearLiveState,
): NearLiveDecision {
  // No usable signal yet.
  if (change.lastEditedAtMs === null) {
    return { action: "ignore", reason: "no-timestamp" };
  }
  // Our own write echoing back through the shape.
  if (change.lastEditedBy && change.lastEditedBy === state.selfUserId) {
    return { action: "ignore", reason: "self" };
  }
  // We've already reconciled this (or a newer) revision.
  if (
    state.appliedAtMs !== null &&
    change.lastEditedAtMs <= state.appliedAtMs
  ) {
    return { action: "ignore", reason: "stale" };
  }
  // Just after our own save: likely our echo even if lastEditedBy is ambiguous.
  if (state.msSinceLastSave < SELF_ECHO_GRACE_MS) {
    return { action: "ignore", reason: "self-echo-grace" };
  }
  // Another user's change. Clean + idle → silently apply (last-write-wins).
  const idle =
    !state.editorDirty &&
    !state.editorFocused &&
    state.msSinceLastEdit >= REMOTE_APPLY_IDLE_MS;
  if (idle) {
    return { action: "refetch" };
  }
  // Dirty / focused / recently typed → never clobber; offer a reload. When the
  // editor is actually dirty, the newer remote version has superseded unsaved
  // local work, so flag it so the UI can warn the losing writer explicitly.
  return { action: "banner", overridden: state.editorDirty };
}
