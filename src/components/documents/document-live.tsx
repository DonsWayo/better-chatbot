"use client";

import { useShape } from "@electric-sql/react";
import { SHAPE_PROXY_PATH } from "lib/realtime/shapes";
import { useEffect, useRef, useState } from "react";

/**
 * Near-live change-signal subscriber for ONE document. Mounted ONLY on
 * /documents/[id] (never in the always-present sidebar or the /documents list),
 * so normal app pages open ZERO Electric connections and Playwright
 * `networkidle` is unaffected. The subscription tears down on unmount.
 *
 * The shape carries only the CHANGE SIGNAL (id, updated_at, last_edited_by,
 * last_edited_at) — never the heavy content jsonb (the proxy pins the column
 * list server-side). When the signal changes, we hand the parent the new
 * last_edited_by / last_edited_at and let it decide (via decideNearLive) whether
 * to silently refetch the body or show a non-destructive reload banner.
 */

type DocumentSignalRow = {
  id: string;
  updated_at: string;
  last_edited_by: string | null;
  last_edited_at: string | null;
};

/** Electric streams naive timestamps without a tz suffix; parse as UTC. */
function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const withZone = /[zZ]|[+-]\d{2}/.test(normalized.slice(10))
    ? normalized
    : `${normalized}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : ms;
}

function DocumentLiveSubscriber({
  documentId,
  shapeUrl,
  onSignal,
}: {
  documentId: string;
  shapeUrl: string;
  onSignal: (change: {
    lastEditedBy: string | null;
    lastEditedAtMs: number | null;
  }) => void;
}) {
  const { isLoading, data } = useShape<DocumentSignalRow>({
    url: shapeUrl,
    params: { table: "document", documentId },
  });

  const lastFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !data) return;
    const row = data.find((r) => r.id === documentId) ?? data[0];
    if (!row) return;
    const fingerprint = `${row.last_edited_by ?? ""}:${row.last_edited_at ?? row.updated_at}`;
    if (lastFingerprint.current === null) {
      // Initial sync mirrors the server-rendered state — no callback.
      lastFingerprint.current = fingerprint;
      return;
    }
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    onSignal({
      lastEditedBy: row.last_edited_by,
      lastEditedAtMs: parseTimestamp(row.last_edited_at ?? row.updated_at),
    });
  }, [isLoading, data, documentId, onSignal]);

  return null;
}

export function DocumentLive({
  documentId,
  onSignal,
}: {
  documentId: string;
  onSignal: (change: {
    lastEditedBy: string | null;
    lastEditedAtMs: number | null;
  }) => void;
}) {
  // Electric needs an absolute URL; defer subscribing until we're in the
  // browser (same pattern as live-thread-messages.tsx). Renders nothing.
  const [shapeUrl, setShapeUrl] = useState<string | null>(null);
  useEffect(() => {
    setShapeUrl(new URL(SHAPE_PROXY_PATH, window.location.origin).toString());
  }, []);

  if (!shapeUrl) return null;
  return (
    <DocumentLiveSubscriber
      documentId={documentId}
      shapeUrl={shapeUrl}
      onSignal={onSignal}
    />
  );
}
