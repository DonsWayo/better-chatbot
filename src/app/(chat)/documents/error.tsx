"use client";

import { RouteErrorCard } from "@/components/route-error-card";

export default function DocumentsError({
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
      title="Documents couldn't be loaded"
      description="Your documents couldn't be fetched. Try again."
    />
  );
}
