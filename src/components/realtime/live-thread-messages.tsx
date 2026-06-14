"use client";

import { useShape } from "@electric-sql/react";
import { SHAPE_PROXY_PATH } from "lib/realtime/shapes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ErrorBoundary } from "@/components/error-boundary";

/**
 * Live island for the read-only shared thread view (phase 2 realtime,
 * read-path only — see content/docs/collaboration/realtime.mdx).
 *
 * Subscribes (via the authenticated /api/realtime/shape proxy — never Electric
 * directly) to the chat_message shape for this thread and calls
 * router.refresh() when the message set changes. The server component keeps
 * owning the rendering: it already maps DB rows to UIMessage and renders
 * PreviewMessage with the full parts/metadata pipeline. Re-rendering messages
 * client-side from raw shape rows would duplicate that mapping (and force
 * parsing the Postgres json[] parts column), so the shape is used purely as a
 * change signal over a tiny `id,created_at,metadata` column set — the proxy
 * pins the column list server-side.
 *
 * `metadata` is part of the signal because near-live shared generation
 * (content/docs/collaboration/realtime.mdx) re-upserts the in-progress
 * assistant message every ~2.5s with a bumped `streamingAt`; fingerprinting
 * ids alone would miss those in-place updates and viewers would only refresh
 * once the final message lands.
 */

const REFRESH_DEBOUNCE_MS = 300;

type ChatMessageSignalRow = {
  id: string;
  created_at: string;
  metadata: Record<string, unknown> | string | null;
};

/** Stable-enough serialization of a row's metadata for the change signal. */
function metadataSignal(metadata: ChatMessageSignalRow["metadata"]): string {
  if (metadata == null) return "";
  return typeof metadata === "string" ? metadata : JSON.stringify(metadata);
}

function LiveThreadMessagesSubscriber({
  threadId,
  shapeUrl,
}: {
  threadId: string;
  shapeUrl: string;
}) {
  const router = useRouter();

  const { isLoading, data } = useShape<ChatMessageSignalRow>({
    url: shapeUrl,
    params: {
      table: "chat_message",
      threadId,
    },
  });

  // Order-independent fingerprint of the message set; new/removed rows change
  // it, and so do in-place metadata bumps from streaming partial persists.
  const fingerprint = isLoading
    ? null
    : data
        .map((row) => `${row.id}:${metadataSignal(row.metadata)}`)
        .sort()
        .join("|");

  const lastFingerprint = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fingerprint === null) return;
    if (lastFingerprint.current === null) {
      // Initial sync mirrors what the server already rendered — no refresh.
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

export function LiveThreadMessages({ threadId }: { threadId: string }) {
  // The Electric client needs an absolute URL; defer subscribing until we are
  // in the browser (this component renders nothing either way).
  const [shapeUrl, setShapeUrl] = useState<string | null>(null);
  useEffect(() => {
    setShapeUrl(new URL(SHAPE_PROXY_PATH, window.location.origin).toString());
  }, []);

  if (!shapeUrl) return null;
  // Contain a useShape long-poll crash: this island is a best-effort change
  // signal (the server already rendered the messages), so failing soft to null
  // is correct — it must never white-screen the shared thread view.
  return (
    <ErrorBoundary fallback={null}>
      <LiveThreadMessagesSubscriber threadId={threadId} shapeUrl={shapeUrl} />
    </ErrorBoundary>
  );
}
