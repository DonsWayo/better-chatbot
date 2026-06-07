import "server-only";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";

const PREFIX = "asafe_ai_";

/**
 * Single Prometheus registry for the app (ADR-0006). EKS pods are long-lived, so in-process
 * counters are scraped by Prometheus at `/api/metrics`. Business metrics (routing — Wave 2,
 * budgets — Wave 3, guardrails — Wave 7) attach labels to the counters below in their waves.
 */
export const metricsRegistry = new Registry();

export const appInfo = new Gauge({
  name: `${PREFIX}app_info`,
  help: "asafe-ai build/runtime info",
  labelNames: ["version"],
  registers: [metricsRegistry],
});

export const chatRequestsTotal = new Counter({
  name: `${PREFIX}chat_requests_total`,
  help: "Total chat requests handled",
  labelNames: ["provider", "model", "status"],
  registers: [metricsRegistry],
});

let initialized = false;

/** Idempotently register default process metrics. Safe to call on every scrape. */
export function ensureMetrics(): Registry {
  if (!initialized) {
    initialized = true;
    collectDefaultMetrics({ register: metricsRegistry, prefix: PREFIX });
    appInfo.set({ version: process.env.APP_VERSION ?? "dev" }, 1);
  }
  return metricsRegistry;
}
