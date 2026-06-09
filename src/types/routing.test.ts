import { describe, it, expect } from "vitest";
import { TASK_CLASSES, MODEL_TIERS, RoutingRequestSchema } from "./routing";

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
    const result = RoutingRequestSchema.safeParse({ declaredTaskClass: "code" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.declaredTaskClass).toBe("code");
  });

  it("rejects invalid task class", () => {
    const result = RoutingRequestSchema.safeParse({ declaredTaskClass: "supercompute" });
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
});
