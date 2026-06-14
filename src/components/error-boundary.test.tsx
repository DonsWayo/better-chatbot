import { type ReactElement, isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./error-boundary";

// Sentry's captureException no-ops without a DSN, but stub it so the test never
// reaches the network and we can assert reporting happens on catch.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

/**
 * The DOM render path (mount → throw → fallback) needs a browser environment we
 * don't ship in the default vitest node runner. Instead we exercise the actual
 * error-boundary contract directly: getDerivedStateFromError + the render()
 * fallback-selection branches, which is where all the logic lives.
 */

const child = <div>healthy child</div>;
const boom = new Error("kaboom");

function makeBoundary(props: Partial<{ fallback: unknown }> = {}) {
  // ErrorBoundary is a class component; instantiate it to drive its lifecycle.
  return new ErrorBoundary({ children: child, ...(props as object) } as never);
}

describe("ErrorBoundary", () => {
  it("derives error state from a thrown error", () => {
    expect(ErrorBoundary.getDerivedStateFromError(boom)).toEqual({
      error: boom,
    });
  });

  it("renders children while no error has been caught", () => {
    const boundary = makeBoundary();
    boundary.state = { error: null };
    expect(boundary.render()).toBe(child);
  });

  it("renders a node fallback when a child has thrown", () => {
    const fallback = <span>panel-failed</span>;
    const boundary = makeBoundary({ fallback });
    boundary.state = { error: boom };
    expect(boundary.render()).toBe(fallback);
  });

  it("renders nothing when fallback is null", () => {
    const boundary = makeBoundary({ fallback: null });
    boundary.state = { error: boom };
    expect(boundary.render()).toBeNull();
  });

  it("invokes a render-function fallback with the error and a retry", () => {
    const fallback = vi.fn<
      (props: { error: Error; retry: () => void }) => ReactElement
    >(() => <span>fn-fallback</span>);
    const boundary = makeBoundary({ fallback });
    boundary.state = { error: boom };
    boundary.render();
    expect(fallback).toHaveBeenCalledTimes(1);
    const arg = fallback.mock.calls[0]![0];
    expect(arg.error).toBe(boom);
    expect(typeof arg.retry).toBe("function");
  });

  it("falls back to the default inline panel when no fallback is provided", () => {
    const boundary = makeBoundary();
    boundary.state = { error: boom };
    const out = boundary.render();
    // A real element (the default muted panel), not the children or null.
    expect(isValidElement(out)).toBe(true);
    expect(out).not.toBe(child);
  });

  it("reports the caught error to Sentry on catch", async () => {
    const Sentry = await import("@sentry/nextjs");
    const onError = vi.fn();
    const boundary = new ErrorBoundary({
      children: child,
      onError,
    });
    boundary.componentDidCatch(boom);
    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
