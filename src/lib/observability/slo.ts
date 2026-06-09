"server-only";

/**
 * W12 — SLO tracking metrics.
 *
 * Tracks the signals Grafana dashboards need for production SLOs:
 *   - Time-to-first-token (TTFT) histograms
 *   - Provider error rate counters
 *   - Active request gauge (backpressure awareness)
 *   - Fallback activation counters
 *
 * These attach to the shared metricsRegistry so they appear on /api/metrics.
 */

import { Counter, Gauge, Histogram } from "prom-client";
import { metricsRegistry } from "./metrics";

const PREFIX = "asafe_ai_";

// Time-to-first-token histogram (the SLO signal)
export const ttftMs = new Histogram({
  name: `${PREFIX}ttft_ms`,
  help: "Time to first token from request received (ms). Primary SLO metric.",
  labelNames: ["provider", "model", "task_class"],
  buckets: [50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000],
  registers: [metricsRegistry],
});

// Provider error counter — distinct from general chatErrors (this is per-provider)
export const providerErrorsTotal = new Counter({
  name: `${PREFIX}provider_errors_total`,
  help: "Errors returned by inference providers (after all SDK retries exhausted)",
  labelNames: ["provider", "model", "error_type"],
  registers: [metricsRegistry],
});

// Fallback activations — how often the primary model fails and we use a candidate
export const providerFallbackTotal = new Counter({
  name: `${PREFIX}provider_fallback_total`,
  help: "Number of times a fallback model was used because the primary was unavailable",
  labelNames: ["primary_provider", "fallback_provider", "fallback_model"],
  registers: [metricsRegistry],
});

// Active requests gauge — helps set backpressure thresholds
export const activeRequests = new Gauge({
  name: `${PREFIX}active_requests`,
  help: "Number of chat requests currently in-flight",
  registers: [metricsRegistry],
});

// Kill-switch activations
export const killSwitchActivations = new Counter({
  name: `${PREFIX}kill_switch_activations_total`,
  help: "Number of requests rejected because the kill switch is active",
  registers: [metricsRegistry],
});

// Rate-limit activations per user
export const rateLimitActivations = new Counter({
  name: `${PREFIX}rate_limit_activations_total`,
  help: "Number of requests rejected by the per-user rate limiter",
  labelNames: ["team_id"],
  registers: [metricsRegistry],
});
