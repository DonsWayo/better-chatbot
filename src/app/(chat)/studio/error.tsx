"use client";

import { RouteErrorCard } from "@/components/route-error-card";

export default function StudioError({
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
      title="Studio couldn't be loaded"
      description="Your agents and knowledge bases couldn't be fetched. Try again."
    />
  );
}
