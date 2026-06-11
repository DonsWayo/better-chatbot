"server-only";

/**
 * W11 — compression savings metrics.
 *
 * Prometheus-only by design: savings are emitted as prom-client counters and
 * a ratio histogram (Grafana "Compression Chars Saved" panel). They are
 * deliberately NOT written to the W3 usage ledger — `asafe_usage_event` is a
 * spend ledger with no event-type/metadata column, so a negative-cost or
 * savings row would corrupt cost/budget aggregation (ADR-0003). Revisit only
 * if the ledger ever grows an event-type discriminator.
 */

import { Counter, Histogram } from "prom-client";

// Prometheus counter for total characters saved across all requests
export const compressionCharsSaved = new Counter({
  name: "asafe_compression_chars_saved_total",
  help: "Total characters removed from prompts by the compression middleware",
  labelNames: ["team_id", "level"],
});

// Histogram for compression ratios (charsAfter / charsBefore)
export const compressionRatio = new Histogram({
  name: "asafe_compression_ratio",
  help: "Ratio of chars after compression to chars before (lower = more compression)",
  labelNames: ["team_id", "level"],
  buckets: [0.1, 0.2, 0.3, 0.5, 0.7, 0.85, 0.95, 1.0],
});

export function recordCompressionSavings(opts: {
  teamId: string | null | undefined;
  level: string;
  charsBefore: number;
  charsAfter: number;
}): void {
  if (opts.charsBefore === 0) return;

  const saved = opts.charsBefore - opts.charsAfter;
  const ratio = opts.charsAfter / opts.charsBefore;
  const labels = {
    team_id: opts.teamId ?? "none",
    level: opts.level,
  };

  if (saved > 0) {
    compressionCharsSaved.inc(labels, saved);
  }
  compressionRatio.observe(labels, ratio);
}
