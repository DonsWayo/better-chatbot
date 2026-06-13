"use client";

import { authClient } from "auth/client";
import { heartbeatDocumentPresenceAction } from "lib/realtime/document-presence-actions";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "lib/realtime/shapes";
import { fetcher } from "lib/utils";
import { EyeIcon } from "lucide-react";
import { useEffect } from "react";
import useSWR from "swr";

/**
 * Lightweight "who's viewing" pill for a PUBLIC chat-export document
 * (/export/[id]). Realtime via POLLING — the export page is public, so the
 * authenticated Electric presence shape can't serve anonymous viewers.
 *
 *  - Logged-in viewers send a heartbeat on mount and every 30s while the tab is
 *    visible (never while hidden). Anonymous viewers don't heartbeat and are
 *    just not counted.
 *  - Everyone polls GET /api/export/[id]/presence for the count while the tab
 *    is visible; the request returns a NUMBER only (never identities) so a
 *    public page never leaks who is reading it.
 *  - Polling pauses while hidden (SWR refreshWhenHidden defaults to false) and
 *    every timer is cleared on unmount — no held-open connection, so the page
 *    still reaches network-idle between polls.
 *
 * Design language: a calm, low-contrast pill, no loud colors (the teal "alive"
 * pulse stays reserved for Runs).
 */

const PRESENCE_POLL_INTERVAL_MS = 15_000;

export default function DocumentPresence({ exportId }: { exportId: string }) {
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session?.user?.id;

  // Heartbeat only while logged in AND the tab is visible. A hidden tab stops
  // beating and the row simply ages out of the active window for everyone else.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    const beat = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      heartbeatDocumentPresenceAction(exportId).catch(() => {
        // Presence is best-effort chrome; never surface heartbeat failures.
      });
    };
    beat();
    const interval = setInterval(beat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [exportId, isLoggedIn]);

  // Poll the count while visible; SWR pauses the interval when the tab is
  // hidden, and the network idles between polls.
  const { data } = useSWR<{ count: number }>(
    `/api/export/${exportId}/presence`,
    fetcher,
    {
      refreshInterval: PRESENCE_POLL_INTERVAL_MS,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  );

  const count = data?.count ?? 0;
  if (count <= 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-full border border-border bg-secondary/40 backdrop-blur-sm px-2.5 py-1"
      data-testid="document-presence"
      title={`${count} ${count === 1 ? "person" : "people"} viewing`}
    >
      <EyeIcon className="size-3" />
      <span>{count} viewing</span>
    </div>
  );
}
