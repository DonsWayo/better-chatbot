import "server-only";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

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

export const routingDecisionsTotal = new Counter({
  name: `${PREFIX}routing_decisions_total`,
  help: "Total automatic routing decisions made by the model router",
  labelNames: ["task_class", "tier", "model"],
  registers: [metricsRegistry],
});

export const chatLatencyMs = new Histogram({
  name: `${PREFIX}chat_latency_ms`,
  help: "Chat request latency in milliseconds (time to first token)",
  labelNames: ["provider", "model", "task_class"],
  buckets: [100, 250, 500, 1000, 2000, 5000, 10000, 30000],
  registers: [metricsRegistry],
});

export const chatErrorsTotal = new Counter({
  name: `${PREFIX}chat_errors_total`,
  help: "Total chat request errors by type",
  labelNames: ["type"], // budget_exceeded | rate_limited | provider_error | auth_error
  registers: [metricsRegistry],
});

export const budgetUtilizationGauge = new Gauge({
  name: `${PREFIX}budget_utilization_ratio`,
  help: "Team budget utilization (used_usd / budget_usd) for active periods",
  labelNames: ["team_id"],
  registers: [metricsRegistry],
});

// ── W7 Guardrail metrics ──────────────────────────────────────────────────────

export const guardrailFiringsTotal = new Counter({
  name: `${PREFIX}guardrail_firings_total`,
  help: "Total guardrail pattern firings by category, action, and policy posture",
  labelNames: ["category", "action", "posture"],
  registers: [metricsRegistry],
});

export const guardrailBlocksTotal = new Counter({
  name: `${PREFIX}guardrail_blocks_total`,
  help: "Total requests blocked by guardrails (blocked=true events)",
  labelNames: ["posture"],
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
