"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";

import { fetcher } from "lib/utils";

/**
 * Render-nothing component that polls GET /api/runs every 3 s while at
 * least one run is actively queued or running, then calls router.refresh()
 * so the parent Server Component re-fetches and pushes fresh props down.
 * When all runs reach a terminal state refreshInterval is set to 0 and SWR
 * stops polling automatically.
 */
export function InboxRunsPoller({
  hasActiveSessions,
}: {
  hasActiveSessions: boolean;
}) {
  const router = useRouter();

  useSWR("/api/runs", fetcher, {
    refreshInterval: hasActiveSessions ? 3000 : 0,
    onSuccess: () => {
      if (hasActiveSessions) router.refresh();
    },
  });

  return null;
}

/** Small pulsing green dot shown in the Runs tab header when polling is live. */
export function LiveBadge() {
  return (
    <span
      className="relative ml-1.5 inline-flex size-2 shrink-0"
      aria-label="Live — auto-updating"
      title="Live — auto-updating"
    >
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-green-500" />
    </span>
  );
}
