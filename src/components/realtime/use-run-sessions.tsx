"use client";

import { useShape } from "@electric-sql/react";
import { SHAPE_PROXY_PATH } from "lib/realtime/shapes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ErrorBoundary } from "@/components/error-boundary";

import {
  type AgentSessionShapeRow,
  fingerprintRunSession,
  fingerprintRunSessions,
} from "./run-session-shape";

/**
 * Live islands for the agent_session Electric shape — the realtime layer for
 * the Runs rail and the /runs/[id] page.
 *
 * NETWORK-IDLE SAFETY (the reason these are split from the always-present rail
 * shell): mounting a useShape subscriber opens an Electric long-poll
 * (live=true) that, by design, never reaches network-idle. So NEITHER of these
 * components may be mounted unconditionally. The callers gate them behind the
 * SAME "has a non-terminal run" condition that already gates SWR polling:
 *
 *   - The rail (AppSidebarRuns) mounts <RunSessionsLive> ONLY while at least
 *     one run is non-terminal. On an idle page (the common case, and the case
 *     during the settings / name-sync / permissions e2e specs, which never
 *     start a run) the rail renders null and this subscriber is never mounted —
 *     zero open Electric connection, network idles, e2e stays green.
 *
 *   - The page (RunPage) mounts <RunSessionLive> ONLY while THAT run is
 *     non-terminal. A completed run opens no connection.
 *
 * When the gate flips to false (all runs terminal / unmount), React unmounts
 * the subscriber and @electric-sql/react aborts its in-flight long-poll and
 * tears down the stream in useShape's cleanup — the connection closes.
 *
 * Like live-thread-messages, the shape is a CHANGE SIGNAL only: on a change we
 * call back (router.refresh / SWR revalidate) and let the existing server/SWR
 * rendering own the UI. We never render runs from raw shape rows.
 */

const REFRESH_DEBOUNCE_MS = 250;

/** Resolve the absolute proxy URL in the browser (Electric needs absolute). */
function useShapeUrl(): string | null {
  const [shapeUrl, setShapeUrl] = useState<string | null>(null);
  useEffect(() => {
    setShapeUrl(new URL(SHAPE_PROXY_PATH, window.location.origin).toString());
  }, []);
  return shapeUrl;
}

/* -------------------------------------------------------------------------- */
/* Runs rail                                                                  */
/* -------------------------------------------------------------------------- */

function RunSessionsSubscriber({
  shapeUrl,
  onChange,
}: {
  shapeUrl: string;
  onChange: () => void;
}) {
  const { isLoading, data, error } = useShape<AgentSessionShapeRow>({
    url: shapeUrl,
    params: { table: "agent_session" },
  });

  const lastFingerprint = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fingerprint =
    isLoading || error ? null : fingerprintRunSessions(data ?? []);

  useEffect(() => {
    if (fingerprint === null) return;
    if (lastFingerprint.current === null) {
      // Initial sync mirrors what SWR already fetched — don't double-refresh.
      lastFingerprint.current = fingerprint;
      return;
    }
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(onChange, REFRESH_DEBOUNCE_MS);
  }, [fingerprint, onChange]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  return null;
}

/**
 * Mounted by AppSidebarRuns ONLY while there is at least one non-terminal run
 * (its caller already returns null otherwise, so this never mounts on an idle
 * page). Pushes live updates on top of the rail's SWR baseline by revalidating
 * `/api/runs` whenever the agent_session shape changes. Fails soft: if the
 * shape errors (Electric down / proxy 5xx) the fingerprint stays null, no
 * callback fires, and the SWR poll keeps the rail fresh on its own.
 */
export function RunSessionsLive({ onChange }: { onChange: () => void }) {
  const shapeUrl = useShapeUrl();
  if (!shapeUrl) return null;
  // Fail soft to null: the rail's SWR poll keeps it fresh on its own, so a
  // crashing useShape must never take down the always-present sidebar.
  return (
    <ErrorBoundary fallback={null}>
      <RunSessionsSubscriber shapeUrl={shapeUrl} onChange={onChange} />
    </ErrorBoundary>
  );
}

/* -------------------------------------------------------------------------- */
/* Single run page                                                            */
/* -------------------------------------------------------------------------- */

function RunSessionSubscriber({
  runId,
  shapeUrl,
}: {
  runId: string;
  shapeUrl: string;
}) {
  const router = useRouter();

  const { isLoading, data, error } = useShape<AgentSessionShapeRow>({
    url: shapeUrl,
    params: { table: "agent_session" },
  });

  const lastFingerprint = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fingerprint =
    isLoading || error ? null : fingerprintRunSession(data ?? [], runId);

  useEffect(() => {
    if (fingerprint === null) return;
    if (lastFingerprint.current === null) {
      lastFingerprint.current = fingerprint;
      return;
    }
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [fingerprint, router]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  return null;
}

/**
 * Mounted by RunPage ONLY while the viewed run is non-terminal (page already
 * guards with `isNonTerminal && ...`). Watches the caller's agent_session shape
 * and router.refresh()es the server-rendered transcript when this run's row
 * changes. Page-scoped — never lives in the always-present sidebar — so it is
 * safe like live-thread-messages: a completed /runs/[id] mounts nothing and
 * opens no connection.
 */
export function RunSessionLive({ runId }: { runId: string }) {
  const shapeUrl = useShapeUrl();
  if (!shapeUrl) return null;
  // Fail soft to null: the page's SWR poller (RunRefreshPoller) keeps the
  // transcript fresh, so a crashing useShape must never blank the run page.
  return (
    <ErrorBoundary fallback={null}>
      <RunSessionSubscriber runId={runId} shapeUrl={shapeUrl} />
    </ErrorBoundary>
  );
}
