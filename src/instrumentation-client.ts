import * as Sentry from "@sentry/nextjs";

// asafe-ai (ADR-0006): browser error tracking. No-op unless NEXT_PUBLIC_SENTRY_DSN is set.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0",
    ),
  });
}
