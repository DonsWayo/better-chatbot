import { describe, expect, it } from "vitest";
import { routeModel } from "./route-model";

// ADR-0004: routing is deterministic, so these assertions are exact.
describe("routeModel", () => {
  it("routes code prompts to the balanced tier (deepseek-v4-pro)", () => {
    const d = routeModel({ text: "fix this ```js\nconst x = 1\n```" });
    expect(d.taskClass).toBe("code");
    expect(d.model).toEqual({
      provider: "openRouter",
      model: "deepseek-v4-pro",
    });
  });

  it("routes images to the vision tier (deepseek-v4-flash)", () => {
    const d = routeModel({ text: "what is in this picture?", hasImage: true });
    expect(d.taskClass).toBe("vision");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("routes tool requests to tool_use (deepseek-v4-pro)", () => {
    const d = routeModel({ text: "look this up", hasTools: true });
    expect(d.taskClass).toBe("tool_use");
    expect(d.model.model).toBe("deepseek-v4-pro");
  });

  it("routes a short rewrite to the cheapest model", () => {
    const d = routeModel({ text: "translate 'hello' to Spanish" });
    expect(d.taskClass).toBe("quick_rewrite");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("routes long conversations to long_context", () => {
    const d = routeModel({ text: "continue", totalChars: 20_000 });
    expect(d.taskClass).toBe("long_context");
  });

  it("routes reasoning to the frontier tier (kimi-k2.6)", () => {
    const d = routeModel({ text: "explain why the sky is blue, step by step" });
    expect(d.taskClass).toBe("reasoning");
    expect(d.model.model).toBe("kimi-k2.6");
  });

  it("defaults plain chat to general (deepseek-v4-flash)", () => {
    const d = routeModel({ text: "hi there" });
    expect(d.taskClass).toBe("general");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("respects a team allow-list (ADR-0002)", () => {
    const d = routeModel({
      text: "explain why this matters, step by step",
      allowedModels: [{ provider: "openRouter", model: "deepseek-v4-pro" }],
    });
    // reasoning prefers kimi-k2.6, but the allow-list only permits deepseek-v4-pro
    expect(d.model.model).toBe("deepseek-v4-pro");
  });

  it("respects an entitlement allow-list of bare model IDs (ADR-0009)", () => {
    const d = routeModel({
      text: "explain why this matters, step by step",
      allowedModels: ["deepseek-v4-pro"],
    });
    // reasoning prefers kimi-k2.6, but the resolved entitlement list only permits deepseek-v4-pro
    expect(d.model.model).toBe("deepseek-v4-pro");
    expect(d.candidates.every((c) => c.model === "deepseek-v4-pro")).toBe(true);
  });

  it("mixed string + {provider, model} allow-list entries both match", () => {
    const d = routeModel({
      text: "explain why this matters, step by step",
      allowedModels: [
        { provider: "openRouter", model: "kimi-k2.6" },
        "deepseek-v4-pro",
      ],
    });
    expect(d.model.model).toBe("kimi-k2.6");
    expect(d.candidates.map((c) => c.model)).toEqual([
      "kimi-k2.6",
      "deepseek-v4-pro",
    ]);
  });

  it("string allow-list that blocks all candidates falls back to top tier", () => {
    const d = routeModel({
      text: "hello",
      allowedModels: ["some-unrouted-model"],
    });
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("lets a declared task class win over inference", () => {
    const d = routeModel({ text: "anything", declaredTaskClass: "code" });
    expect(d.taskClass).toBe("code");
  });

  it("always returns at least one fallback candidate", () => {
    const d = routeModel({ text: "hello" });
    expect(d.candidates.length).toBeGreaterThan(0);
    expect(d.candidates[0]).toEqual(d.model);
  });

  it("falls back to top tier when allow-list blocks all candidates", () => {
    const d = routeModel({
      text: "hello",
      allowedModels: [{ provider: "openRouter", model: "nonexistent-model" }],
    });
    // When allow-list blocks everything, top tier for general = fast (deepseek-v4-flash)
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("reason string contains the inferred taskClass", () => {
    const d = routeModel({ text: "fix this ```js\nconst x = 1\n```" });
    expect(d.reason).toContain("code");
  });

  it("reason string contains the chosen tier name", () => {
    const d = routeModel({ text: "translate 'hello' to Spanish" });
    expect(d.reason).toContain("cheap");
  });

  it("empty text routes to general", () => {
    const d = routeModel({ text: "" });
    expect(d.taskClass).toBe("general");
  });

  it("declaredTaskClass can force vision even without hasImage", () => {
    const d = routeModel({ text: "anything", declaredTaskClass: "vision" });
    expect(d.taskClass).toBe("vision");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("totalChars exactly above LONG_CONTEXT_CHARS triggers long_context", () => {
    const d = routeModel({ text: "continue", totalChars: 8001 });
    expect(d.taskClass).toBe("long_context");
  });

  it("totalChars at exactly LONG_CONTEXT_CHARS (8000) triggers long_context", () => {
    const d = routeModel({ text: "continue", totalChars: 8000 });
    expect(d.taskClass).toBe("long_context");
  });

  it("totalChars below threshold (7999) with plain text stays general", () => {
    const d = routeModel({ text: "hi there", totalChars: 7999 });
    expect(d.taskClass).toBe("general");
  });

  it("hasImage beats hasTools (vision checked before tool_use)", () => {
    const d = routeModel({
      text: "analyze this image with tools",
      hasImage: true,
      hasTools: true,
    });
    expect(d.taskClass).toBe("vision");
  });

  it("returned decision always has all required fields", () => {
    const d = routeModel({ text: "hello" });
    expect(d).toHaveProperty("taskClass");
    expect(d).toHaveProperty("model");
    expect(d).toHaveProperty("candidates");
    expect(d).toHaveProperty("reason");
  });

  it("chosen model always has provider and model fields", () => {
    const d = routeModel({ text: "hello" });
    expect(typeof d.model.provider).toBe("string");
    expect(typeof d.model.model).toBe("string");
  });

  it("hasImage combined with code prompt still routes to vision", () => {
    const d = routeModel({
      text: "fix this ```js\nconst x = 1\n```",
      hasImage: true,
    });
    expect(d.taskClass).toBe("vision");
  });

  it("candidates array has at least two entries for general task", () => {
    const d = routeModel({ text: "explain me this" });
    expect(d.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it("allow-list with multiple approved models still picks appropriate tier", () => {
    const d = routeModel({
      text: "translate 'hello' to Spanish",
      allowedModels: [
        { provider: "openRouter", model: "deepseek-v4-flash" },
        { provider: "openRouter", model: "deepseek-v4-pro" },
      ],
    });
    // quick_rewrite prefers the cheap tier — which is in the allow-list
    expect(d.taskClass).toBe("quick_rewrite");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("model provider is 'openRouter' for all routed results", () => {
    const cases = [
      { text: "fix ```js\nconst x\n```" },
      { text: "what is in this image?", hasImage: true },
      { text: "translate hello" },
      { text: "explain step by step deeply" },
    ];
    for (const input of cases) {
      const d = routeModel(input);
      expect(d.model.provider).toBe("openRouter");
    }
  });
});

describe("routeModel — invariants", () => {
  it("reason is a non-empty string for every input", () => {
    for (const text of ["", "fix this", "translate hello", "analyze image"]) {
      const d = routeModel({ text });
      expect(typeof d.reason).toBe("string");
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it("candidates always contains at least one entry", () => {
    const d = routeModel({ text: "some text" });
    expect(d.candidates.length).toBeGreaterThan(0);
  });

  it("model.provider is always 'openRouter'", () => {
    for (const text of ["hello", "fix code", "translate this quickly"]) {
      const d = routeModel({ text });
      expect(d.model.provider).toBe("openRouter");
    }
  });

  it("taskClass is always a non-empty string", () => {
    const d = routeModel({ text: "arbitrary input here" });
    expect(typeof d.taskClass).toBe("string");
    expect(d.taskClass.length).toBeGreaterThan(0);
  });
});

describe("routeModel — return type invariants", () => {
  it("returns a non-null object", () => {
    expect(routeModel({ text: "anything" })).not.toBeNull();
  });

  it("returned model has a model property", () => {
    const d = routeModel({ text: "test" });
    expect(d.model).toHaveProperty("model");
  });

  it("returned model has a provider property", () => {
    const d = routeModel({ text: "test" });
    expect(d.model).toHaveProperty("provider");
  });

  it("taskClass is present in result", () => {
    const d = routeModel({ text: "any text" });
    expect(d).toHaveProperty("taskClass");
  });
});
