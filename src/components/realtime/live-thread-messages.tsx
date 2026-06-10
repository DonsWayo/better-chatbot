"use client";

import { useShape } from "@electric-sql/react";
import { SHAPE_PROXY_PATH } from "lib/realtime/shapes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
 * change signal over a tiny `id,created_at` column set — the proxy pins the
 * column list server-side.
 */

const REFRESH_DEBOUNCE_MS = 300;

type ChatMessageSignalRow = {
  id: string;
  created_at: string;
};

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

  // Order-independent fingerprint of the message set; new/removed rows change it.
  const fingerprint = isLoading
    ? null
    : data
        .map((row) => row.id)
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
  return (
    <LiveThreadMessagesSubscriber threadId={threadId} shapeUrl={shapeUrl} />
  );
}
