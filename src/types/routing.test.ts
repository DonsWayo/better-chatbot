import { describe, expect, it } from "vitest";
import { MODEL_TIERS, RoutingRequestSchema, TASK_CLASSES } from "./routing";

describe("TASK_CLASSES", () => {
  it("includes all 7 expected classes", () => {
    expect(TASK_CLASSES).toContain("code");
    expect(TASK_CLASSES).toContain("reasoning");
    expect(TASK_CLASSES).toContain("long_context");
    expect(TASK_CLASSES).toContain("vision");
    expect(TASK_CLASSES).toContain("tool_use");
    expect(TASK_CLASSES).toContain("quick_rewrite");
    expect(TASK_CLASSES).toContain("general");
  });

  it("has exactly 7 task classes", () => {
    expect(TASK_CLASSES).toHaveLength(7);
  });

  it("all classes are lowercase strings", () => {
    for (const c of TASK_CLASSES) {
      expect(typeof c).toBe("string");
      expect(c).toBe(c.toLowerCase());
    }
  });
});

describe("MODEL_TIERS", () => {
  it("includes frontier, balanced, fast, cheap", () => {
    expect(MODEL_TIERS).toContain("frontier");
    expect(MODEL_TIERS).toContain("balanced");
    expect(MODEL_TIERS).toContain("fast");
    expect(MODEL_TIERS).toContain("cheap");
  });

  it("has exactly 4 tiers", () => {
    expect(MODEL_TIERS).toHaveLength(4);
  });
});

describe("RoutingRequestSchema", () => {
  it("parses minimal input (empty request)", () => {
    const result = RoutingRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.text).toBe("");
      expect(result.data.hasImage).toBe(false);
      expect(result.data.hasTools).toBe(false);
      expect(result.data.totalChars).toBe(0);
    }
  });

  it("accepts valid task class", () => {
    const result = RoutingRequestSchema.safeParse({
      declaredTaskClass: "code",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.declaredTaskClass).toBe("code");
  });

  it("rejects invalid task class", () => {
    const result = RoutingRequestSchema.safeParse({
      declaredTaskClass: "supercompute",
    });
    expect(result.success).toBe(false);
  });

  it("accepts full routing request", () => {
    const result = RoutingRequestSchema.safeParse({
      text: "Write a function to sort an array",
      declaredTaskClass: "code",
      hasImage: false,
      hasAttachments: true,
      hasTools: true,
      totalChars: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative totalChars", () => {
    const result = RoutingRequestSchema.safeParse({ totalChars: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts allowedModels array", () => {
    const result = RoutingRequestSchema.safeParse({
      allowedModels: [
        { provider: "openrouter", model: "anthropic/claude-3-5-sonnet" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts allowedModels as bare model-ID strings (ADR-0009 resolver form)", () => {
    const result = RoutingRequestSchema.safeParse({
      allowedModels: ["gpt-5.5", "claude-opus-4.8"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a mixed allowedModels array of strings and objects", () => {
    const result = RoutingRequestSchema.safeParse({
      allowedModels: ["gpt-5.5", { provider: "openRouter", model: "o4-mini" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects allowedModels entries that are neither string nor {provider, model}", () => {
    const result = RoutingRequestSchema.safeParse({
      allowedModels: [42],
    });
    expect(result.success).toBe(false);
  });

  it("defaults hasImage to false", () => {
    const result = RoutingRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hasImage).toBe(false);
  });

  it("defaults hasTools to false", () => {
    const result = RoutingRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hasTools).toBe(false);
  });

  it("accepts vision task class", () => {
    const r = RoutingRequestSchema.safeParse({
      declaredTaskClass: "vision",
      hasImage: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts reasoning task class", () => {
    const r = RoutingRequestSchema.safeParse({
      declaredTaskClass: "reasoning",
    });
    expect(r.success).toBe(true);
  });

  it("accepts quick_rewrite task class", () => {
    const r = RoutingRequestSchema.safeParse({
      declaredTaskClass: "quick_rewrite",
    });
    expect(r.success).toBe(true);
  });
});

describe("TASK_CLASSES — additional constraints", () => {
  it("has no duplicate entries", () => {
    const unique = new Set(TASK_CLASSES);
    expect(unique.size).toBe(TASK_CLASSES.length);
  });

  it("does not contain any uppercase class names", () => {
    for (const cls of TASK_CLASSES) {
      expect(cls).not.toMatch(/[A-Z]/);
    }
  });
});

describe("MODEL_TIERS — additional constraints", () => {
  it("has no duplicate entries", () => {
    const unique = new Set(MODEL_TIERS);
    expect(unique.size).toBe(MODEL_TIERS.length);
  });

  it("all tiers are lowercase strings", () => {
    for (const t of MODEL_TIERS) {
      expect(typeof t).toBe("string");
      expect(t).toBe(t.toLowerCase());
    }
  });
});

describe("RoutingRequestSchema — invariants", () => {
  it("text defaults to empty string when omitted", () => {
    const result = RoutingRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.text).toBe("");
  });

  it("totalChars defaults to 0 when omitted", () => {
    const result = RoutingRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.totalChars).toBe(0);
  });

  it("long_context is accepted as a valid task class", () => {
    const result = RoutingRequestSchema.safeParse({
      declaredTaskClass: "long_context",
    });
    expect(result.success).toBe(true);
  });

  it("tool_use is accepted as a valid task class", () => {
    const result = RoutingRequestSchema.safeParse({
      declaredTaskClass: "tool_use",
    });
    expect(result.success).toBe(true);
  });
});

describe("RoutingRequestSchema — shape invariants", () => {
  it("accepts object with no fields (all optional)", () => {
    const result = RoutingRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects array input", () => {
    const result = RoutingRequestSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = RoutingRequestSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("accepts valid declaredTaskClass string", () => {
    const result = RoutingRequestSchema.safeParse({
      declaredTaskClass: "code",
    });
    expect(result.success).toBe(true);
  });
});
