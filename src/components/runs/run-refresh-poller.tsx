"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";

import { fetcher } from "lib/utils";

/**
 * Mounted only while a run is non-terminal: polls the run endpoint every 4s
 * and refreshes the server-rendered transcript so new steps appear.
 * (Stopgap until the SSE /api/runs/[id]/stream channel lands.)
 */
export function RunRefreshPoller({ runId }: { runId: string }) {
  const router = useRouter();

  useSWR(`/api/runs/${runId}`, fetcher, {
    refreshInterval: 4000,
    onSuccess: () => router.refresh(),
  });

  return null;
}
