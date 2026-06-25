"use client";

import { RouteErrorCard } from "@/components/route-error-card";

/**
 * Error boundary for a single chat thread (asafe-ai resilience). The thread view
 * streams messages and mounts realtime islands; a crash in any of them is caught
 * here so the sidebar/shell survive and the user can retry the thread.
 */
export default function ChatThreadError({
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
      title="This conversation couldn’t be loaded"
      description="The chat ran into an unexpected error. Try again — your other conversations are unaffected."
    />
  );
}
