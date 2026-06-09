import { routeModel } from "lib/ai/routing/route-model";
import { describe, expect, it } from "vitest";
import { EVAL_FIXTURES } from "./fixtures";
import { MODEL_PRICES } from "./prices";

// Wave 2 routing eval — sanity guard (ADR-0004).
// Asserts that the blended cost when routing is <= always choosing frontier.

const FRONTIER_MODEL = "claude-opus-4.8";

// Synthetic token counts used consistently across the eval script and test.
const INPUT_TOKENS = 1_000;
const OUTPUT_TOKENS = 500;

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

describe("routing eval — blended cost guard (ADR-0004)", () => {
  it("routed total cost is <= always-frontier total cost", () => {
    let routedTotal = 0;
    let frontierTotal = 0;

    for (const fixture of EVAL_FIXTURES) {
      const decision = routeModel(fixture.request);
      const routedModel = decision.model.model;

      routedTotal += costUsd(routedModel, INPUT_TOKENS, OUTPUT_TOKENS);
      frontierTotal += costUsd(FRONTIER_MODEL, INPUT_TOKENS, OUTPUT_TOKENS);
    }

    // Primary assertion: routing must save money (or at worst break even).
    expect(routedTotal).toBeLessThanOrEqual(frontierTotal);

    // Informational: log the reduction so CI logs are useful.
    const reduction = ((frontierTotal - routedTotal) / frontierTotal) * 100;
    console.log(
      `Routing eval — routedTotal=$${routedTotal.toFixed(6)} ` +
        `frontierTotal=$${frontierTotal.toFixed(6)} ` +
        `reduction=${reduction.toFixed(1)}%`,
    );
  });

  it("every fixture resolves to a model with a known price entry", () => {
    for (const fixture of EVAL_FIXTURES) {
      const decision = routeModel(fixture.request);
      const modelName = decision.model.model;
      expect(
        MODEL_PRICES,
        `Missing price for model "${modelName}" (fixture: ${fixture.name})`,
      ).toHaveProperty(modelName);
    }
  });
});

describe("routing eval — per-category tier assignments", () => {
  it("code fixtures route to balanced tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("code/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be balanced`).toBe("balanced");
    }
  });

  it("vision fixtures route to fast tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("vision/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be fast`).toBe("fast");
    }
  });

  it("quick_rewrite fixtures route to cheap tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("quick_rewrite/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be cheap`).toBe("cheap");
    }
  });

  it("general fixtures route to fast tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("general/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be fast`).toBe("fast");
    }
  });

  it("reasoning fixtures route to frontier tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("reasoning/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be frontier`).toBe("frontier");
    }
  });

  it("long_context fixtures route to balanced tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("long_context/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be balanced`).toBe("balanced");
    }
  });

  it("tool_use fixtures route to balanced tier", () => {
    for (const f of EVAL_FIXTURES.filter((x) => x.name.startsWith("tool_use/"))) {
      const d = routeModel(f.request);
      expect(d.tier, `${f.name} should be balanced`).toBe("balanced");
    }
  });
});

describe("routing eval — decision structure", () => {
  it("every decision has a non-empty reason string", () => {
    for (const fixture of EVAL_FIXTURES) {
      const d = routeModel(fixture.request);
      expect(typeof d.reason).toBe("string");
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it("every decision has a non-empty candidates array", () => {
    for (const fixture of EVAL_FIXTURES) {
      const d = routeModel(fixture.request);
      expect(Array.isArray(d.candidates)).toBe(true);
      expect(d.candidates.length).toBeGreaterThan(0);
    }
  });

  it("every decision model has provider openRouter", () => {
    for (const fixture of EVAL_FIXTURES) {
      const d = routeModel(fixture.request);
      expect(d.model.provider).toBe("openRouter");
    }
  });

  it("routing achieves at least 20% cost reduction vs always-frontier", () => {
    let routedTotal = 0;
    let frontierTotal = 0;
    for (const fixture of EVAL_FIXTURES) {
      const d = routeModel(fixture.request);
      routedTotal += costUsd(d.model.model, INPUT_TOKENS, OUTPUT_TOKENS);
      frontierTotal += costUsd(FRONTIER_MODEL, INPUT_TOKENS, OUTPUT_TOKENS);
    }
    const reduction = ((frontierTotal - routedTotal) / frontierTotal) * 100;
    expect(reduction).toBeGreaterThan(20);
  });
});
