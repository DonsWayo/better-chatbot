"use client";

import { RouteErrorCard } from "@/components/route-error-card";

/**
 * Error boundary for the per-run page (asafe-ai resilience). This page renders a
 * live-updating run transcript with a page-scoped Electric subscriber; if the
 * realtime island or transcript render throws, contain it here instead of
 * white-screening the run view.
 */
export default function RunPageError({
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
      title="This run couldn’t be displayed"
      description="The run view ran into an unexpected error. Try again — the rest of the app is still working."
    />
  );
}
