"use client";

import * as Sentry from "@sentry/nextjs";
import { RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";

/**
 * Reusable component-level error boundary (asafe-ai resilience).
 *
 * React error boundaries MUST be class components — there is no hook equivalent
 * for `componentDidCatch` / `getDerivedStateFromError`. This catches render and
 * lifecycle errors thrown by its children so that a single crashing island
 * (e.g. an Electric `useShape` long-poll, a streaming reader, or the TipTap
 * editor) degrades to a compact inline fallback instead of white-screening the
 * whole page through Next's route-segment error.tsx.
 *
 * - `fallback` may be a node (rendered as-is) or a render function that receives
 *   `retry` so callers can offer a "try again" affordance. Pass `null` to
 *   silence non-visual islands (e.g. headless realtime subscribers).
 * - Errors are reported to Sentry via captureException, which no-ops when no
 *   DSN is configured (see instrumentation-client.ts) — safe in local/dev.
 */

type FallbackRender = (props: {
  error: Error;
  retry: () => void;
}) => ReactNode;

type ErrorBoundaryProps = {
  children: ReactNode;
  /**
   * What to render once a child has thrown. A node is rendered verbatim; a
   * function receives the error + a `retry` that resets the boundary. Omit for
   * the default compact muted fallback. Pass `null` to render nothing.
   */
  fallback?: ReactNode | FallbackRender;
  /** Optional hook for callers that want to react to the caught error. */
  onError?: (error: Error) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // No-ops without a DSN; reports the panel crash when Sentry is configured.
    Sentry.captureException(error);
    this.props.onError?.(error);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const { fallback } = this.props;
    if (fallback !== undefined) {
      if (typeof fallback === "function") {
        return (fallback as FallbackRender)({ error, retry: this.retry });
      }
      return fallback;
    }

    // Default: a calm, muted inline fallback with a retry.
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex-1">This panel failed to load.</span>
        <button
          type="button"
          onClick={this.retry}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="size-3" />
          Retry
        </button>
      </div>
    );
  }
}
