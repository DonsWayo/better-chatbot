"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "ui/button";

/**
 * Shared visual for Next.js route-segment error.tsx boundaries (asafe-ai
 * resilience). Renders a calm, on-brand card (Conek teal accent) with a short
 * message and a "Try again" button wired to the segment's `reset()`. Reports the
 * error to Sentry on mount (no-ops without a DSN — see instrumentation-client.ts)
 * and, in development only, shows the error message to aid debugging.
 *
 * Kept deliberately dependency-light so it can render even when the segment that
 * crashed pulls in heavy/fragile data.
 */
export function RouteErrorCard({
  error,
  reset,
  title = "Something went wrong",
  description = "This part of the app ran into an unexpected error. You can try again — the rest of the app is still working.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div
          aria-hidden
          className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="mb-1.5 text-lg font-semibold">{title}</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <Button onClick={() => reset()} className="gap-1.5">
          <RefreshCw className="size-4" />
          Try again
        </Button>
        {process.env.NODE_ENV === "development" && error?.message ? (
          <pre className="mt-6 max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-left text-xs leading-relaxed text-muted-foreground">
            {error.message}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
