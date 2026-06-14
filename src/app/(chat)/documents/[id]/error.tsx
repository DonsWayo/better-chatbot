"use client";

import { RouteErrorCard } from "@/components/route-error-card";

/**
 * Error boundary for the document editor route (asafe-ai resilience). The editor
 * surface mounts the documents feature's only Electric near-live island plus the
 * TipTap editor; if either throws during render this contains it to a calm card
 * rather than blanking the page.
 */
export default function DocumentEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorCard
      error={error}
      reset={reset}
      title="This document couldn’t be opened"
      description="The editor ran into an unexpected error. Try again, or head back to your documents."
    />
  );
}
