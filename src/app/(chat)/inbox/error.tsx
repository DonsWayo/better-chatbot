"use client";

import { RouteErrorCard } from "@/components/route-error-card";

export default function InboxError({
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
      title="Inbox couldn't be loaded"
      description="Your approvals and runs couldn't be fetched. Try again."
    />
  );
}
