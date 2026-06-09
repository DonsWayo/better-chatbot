import { describe, it, expect } from "vitest";
import { TIER_MODEL, TASK_TIERS, LONG_CONTEXT_CHARS } from "./policy";

describe("TIER_MODEL", () => {
  it("all four tiers have a model entry", () => {
    expect(TIER_MODEL.frontier).toBeDefined();
    expect(TIER_MODEL.balanced).toBeDefined();
    expect(TIER_MODEL.fast).toBeDefined();
    expect(TIER_MODEL.cheap).toBeDefined();
  });

  it("each tier uses the openRouter provider", () => {
    for (const entry of Object.values(TIER_MODEL)) {
      expect(entry.provider).toBe("openRouter");
      expect(typeof entry.model).toBe("string");
      expect(entry.model.length).toBeGreaterThan(0);
    }
  });
});

describe("TASK_TIERS", () => {
  const allTaskClasses = [
    "code",
    "reasoning",
    "long_context",
    "vision",
    "tool_use",
    "quick_rewrite",
    "general",
  ] as const;

  it("covers all expected task classes", () => {
    for (const cls of allTaskClasses) {
      expect(TASK_TIERS[cls]).toBeDefined();
      expect(TASK_TIERS[cls].length).toBeGreaterThan(0);
    }
  });

  it("each tier in fallback list exists in TIER_MODEL", () => {
    const validTiers = new Set(Object.keys(TIER_MODEL));
    for (const [cls, tiers] of Object.entries(TASK_TIERS)) {
      for (const tier of tiers) {
        expect(validTiers.has(tier), `${cls}: unknown tier "${tier}"`).toBe(true);
      }
    }
  });

  it("code uses balanced as primary tier", () => {
    expect(TASK_TIERS.code[0]).toBe("balanced");
  });

  it("reasoning uses frontier as primary tier", () => {
    expect(TASK_TIERS.reasoning[0]).toBe("frontier");
  });

  it("quick_rewrite uses cheap as primary tier", () => {
    expect(TASK_TIERS.quick_rewrite[0]).toBe("cheap");
  });

  it("no duplicate tiers in a task class", () => {
    for (const [cls, tiers] of Object.entries(TASK_TIERS)) {
      const unique = new Set(tiers);
      expect(unique.size, `${cls} has duplicate tiers`).toBe(tiers.length);
    }
  });
});

describe("LONG_CONTEXT_CHARS", () => {
  it("is a positive number", () => {
    expect(LONG_CONTEXT_CHARS).toBeGreaterThan(0);
    expect(typeof LONG_CONTEXT_CHARS).toBe("number");
  });
});
