/**
 * Wave 2 routing eval script (ADR-0004).
 *
 * Usage:
 *   pnpm tsx scripts/eval-routing.ts
 *
 * Prints a per-fixture table showing the routed model, its estimated cost, and
 * the cost that would have been incurred by always sending to the frontier model
 * (claude-opus-4.8). No live API calls are made — costs are computed from the
 * static price table in src/lib/ai/routing/eval/prices.ts.
 */

import { EVAL_FIXTURES } from "../src/lib/ai/routing/eval/fixtures";
import { MODEL_PRICES } from "../src/lib/ai/routing/eval/prices";
import { routeModel } from "../src/lib/ai/routing/route-model";

// ── Config ────────────────────────────────────────────────────────────────────

const FRONTIER_MODEL = "claude-opus-4.8";

/** Synthetic token counts used to estimate cost per request. */
const INPUT_TOKENS = 1_000;
const OUTPUT_TOKENS = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function costUsd(modelName: string, inTok: number, outTok: number): number {
  const prices = MODEL_PRICES[modelName];
  if (!prices) {
    throw new Error(`No price entry for model "${modelName}"`);
  }
  return (
    (inTok / 1_000_000) * prices.inPerMTok +
    (outTok / 1_000_000) * prices.outPerMTok
  );
}

function fmt(n: number): string {
  return `$${n.toFixed(6)}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Row = {
  fixture: string;
  taskClass: string;
  routedModel: string;
  routedCost: string;
  frontierCost: string;
};

let routedTotal = 0;
let frontierTotal = 0;

const rows: Row[] = [];

for (const fixture of EVAL_FIXTURES) {
  const decision = routeModel(fixture.request);
  const routedModel = decision.model.model;

  const routedCost = costUsd(routedModel, INPUT_TOKENS, OUTPUT_TOKENS);
  const fCost = costUsd(FRONTIER_MODEL, INPUT_TOKENS, OUTPUT_TOKENS);

  routedTotal += routedCost;
  frontierTotal += fCost;

  rows.push({
    fixture: fixture.name,
    taskClass: decision.taskClass,
    routedModel,
    routedCost: fmt(routedCost),
    frontierCost: fmt(fCost),
  });
}

console.log("\n=== Wave 2 Routing Eval ===\n");
console.log(
  `Token assumptions: ${INPUT_TOKENS.toLocaleString()} in / ${OUTPUT_TOKENS.toLocaleString()} out per request\n`,
);

console.table(rows);

const savings = frontierTotal - routedTotal;
const pct = (savings / frontierTotal) * 100;

console.log("\n─── Totals ───────────────────────────────────────────────────");
console.log(`  Routed total    : ${fmt(routedTotal)}`);
console.log(`  Frontier total  : ${fmt(frontierTotal)}`);
console.log(
  `  Savings         : ${fmt(savings)}  (${pct.toFixed(1)}% reduction)`,
);
console.log("──────────────────────────────────────────────────────────────\n");
