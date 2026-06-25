"use client";

import { RouteErrorCard } from "@/components/route-error-card";

/**
 * Error boundary for the main authenticated shell (asafe-ai resilience). Most
 * pages live under (chat), so a crash in any of them is caught here and shown as
 * a calm card inside the app shell (sidebar/layout stay intact) instead of
 * white-screening to the root global-error.
 */
export default function ChatSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorCard error={error} reset={reset} />;
}
