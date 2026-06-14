"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root last-resort error boundary (asafe-ai resilience).
 *
 * global-error.tsx replaces the WHOLE document when an error escapes every
 * nested error.tsx (or is thrown by the root layout itself), so it must render
 * its own <html>/<body>. It cannot rely on the app's CSS being applied, so the
 * branding here is inlined and intentionally minimal — a calm card with the
 * Conek teal accent and a Reload action.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No-ops without a DSN (instrumentation-client.ts).
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b1416",
          color: "#e6f1f1",
        }}
      >
        <div
          style={{
            maxWidth: "26rem",
            width: "100%",
            borderRadius: "1rem",
            border: "1px solid rgba(58,191,198,0.25)",
            background: "rgba(255,255,255,0.03)",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden
            style={{
              width: "2.5rem",
              height: "2.5rem",
              margin: "0 auto 1rem",
              borderRadius: "9999px",
              background: "rgba(58,191,198,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#3ABFC6",
              fontSize: "1.25rem",
            }}
          >
            !
          </div>
          <h1
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.125rem",
              fontWeight: 600,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0 0 1.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.5,
              color: "rgba(230,241,241,0.65)",
            }}
          >
            An unexpected error interrupted the app. You can reload to get back
            to where you were.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              borderRadius: "0.625rem",
              border: "none",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              background: "#3ABFC6",
              color: "#0A3438",
            }}
          >
            Reload
          </button>
          {process.env.NODE_ENV === "development" && error?.message ? (
            <pre
              style={{
                marginTop: "1.5rem",
                maxHeight: "10rem",
                overflow: "auto",
                borderRadius: "0.5rem",
                background: "rgba(0,0,0,0.35)",
                padding: "0.75rem",
                textAlign: "left",
                fontSize: "0.75rem",
                lineHeight: 1.5,
                color: "rgba(230,241,241,0.8)",
              }}
            >
              {error.message}
            </pre>
          ) : null}
        </div>
      </body>
    </html>
  );
}
