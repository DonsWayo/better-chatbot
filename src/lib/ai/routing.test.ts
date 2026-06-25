/**
 * Deep unit tests: model routing and entitlement system (ADR-0004, ADR-0009).
 *
 * Coverage targets:
 *   - routeModel: task-class inference (regex/priority/boundary), allow-list
 *     filtering (string, object, mixed), fallback mechanics, decision shape
 *   - resolveModelAllowList: every composition branch, dedupe, inherit/replace
 *   - Guardrail strictness ordering (stricterGuardrail extracted as pure logic)
 *   - TASK_TIERS / TIER_MODEL policy invariants
 *   - Zod RoutingRequestSchema coercion and validation
 *   - isModelAllowed enforcement predicate (inline, extracted from chat route)
 *   - MODEL_PRICES completeness against approved model registry
 */

import { RoutingRequestSchema } from "app-types/routing";
import { resolveModelAllowList } from "lib/admin/model-policy";
import { MODEL_PRICES } from "lib/ai/routing/eval/prices";
import {
  LONG_CONTEXT_CHARS,
  TASK_TIERS,
  TIER_MODEL,
} from "lib/ai/routing/policy";
import { routeModel } from "lib/ai/routing/route-model";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Approved cost-stack model IDs (the only ids auto-routing ever returns). */
const COST_STACK_MODELS = [
  "kimi-k2.6", // frontier
  "deepseek-v4-pro", // balanced
  "deepseek-v4-flash", // fast / cheap
] as const;

/** Approved premium models (entitlement-only, never auto-routed). */
const PREMIUM_MODELS = [
  "gpt-5.5",
  "claude-opus-4.8",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
] as const;

// ---------------------------------------------------------------------------
// § 1  Task-class inference — regex boundary cases (CODE_RE)
// ---------------------------------------------------------------------------

describe("routeModel — CODE_RE detection", () => {
  it("triple-backtick code fence triggers code classification", () => {
    const d = routeModel({ text: "Look at this:\n```\nconst x = 1\n```" });
    expect(d.taskClass).toBe("code");
  });

  it("'function' keyword triggers code classification", () => {
    const d = routeModel({ text: "function add(a, b) { return a + b; }" });
    expect(d.taskClass).toBe("code");
  });

  it("'class' keyword triggers code classification", () => {
    const d = routeModel({ text: "class Foo extends Bar {}" });
    expect(d.taskClass).toBe("code");
  });

  it("'import' keyword triggers code classification", () => {
    const d = routeModel({ text: "import { useState } from 'react'" });
    expect(d.taskClass).toBe("code");
  });

  it("'async' keyword triggers code classification", () => {
    const d = routeModel({ text: "async function fetchData() {}" });
    expect(d.taskClass).toBe("code");
  });

  it("'console.' reference triggers code classification", () => {
    const d = routeModel({ text: "console.log('debug')" });
    expect(d.taskClass).toBe("code");
  });

  it("'npm' triggers code classification", () => {
    const d = routeModel({ text: "run npm install to set up the project" });
    expect(d.taskClass).toBe("code");
  });

  it("'pnpm' triggers code classification", () => {
    const d = routeModel({ text: "pnpm run dev should start the server" });
    expect(d.taskClass).toBe("code");
  });

  it("'stacktrace' triggers code classification", () => {
    const d = routeModel({ text: "I see a stack trace in my logs" });
    expect(d.taskClass).toBe("code");
  });

  it("arrow '=>' triggers code classification", () => {
    const d = routeModel({ text: "use () => {} style instead of function" });
    expect(d.taskClass).toBe("code");
  });

  it("'exception' keyword triggers code classification", () => {
    const d = routeModel({ text: "getting an exception thrown at runtime" });
    expect(d.taskClass).toBe("code");
  });

  it("'traceback' triggers code classification", () => {
    const d = routeModel({ text: "Python traceback shows a KeyError" });
    expect(d.taskClass).toBe("code");
  });

  it("pure prose without code keywords does not trigger code", () => {
    const d = routeModel({ text: "what is the capital of France?" });
    expect(d.taskClass).not.toBe("code");
  });
});

// ---------------------------------------------------------------------------
// § 2  Task-class inference — REWRITE_RE / REASONING_RE boundaries
// ---------------------------------------------------------------------------

describe("routeModel — REWRITE_RE detection", () => {
  it("'summarize' triggers quick_rewrite on a short text", () => {
    const d = routeModel({ text: "summarize this in one sentence" });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("'summarise' (British spelling) also triggers quick_rewrite", () => {
    const d = routeModel({ text: "summarise the key points" });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("'rephrase' triggers quick_rewrite on a short text", () => {
    const d = routeModel({ text: "rephrase this sentence" });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("'translate' triggers quick_rewrite on a short text", () => {
    const d = routeModel({ text: "translate hello to German" });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("'tl;dr' triggers quick_rewrite on a short text", () => {
    const d = routeModel({ text: "tl;dr of this article?" });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("'proofread' triggers quick_rewrite on a short text", () => {
    const d = routeModel({ text: "proofread my email" });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("a rewrite keyword on text > 240 chars routes to general, not quick_rewrite", () => {
    // The rewrite check only fires when text.length <= 240.
    const longText = "translate " + "a".repeat(232); // total > 240
    const d = routeModel({ text: longText });
    expect(d.taskClass).not.toBe("quick_rewrite");
  });
});

describe("routeModel — REASONING_RE detection", () => {
  it("'explain' triggers reasoning class", () => {
    const d = routeModel({ text: "explain how TCP/IP works" });
    expect(d.taskClass).toBe("reasoning");
  });

  it("'analyze' triggers reasoning class", () => {
    const d = routeModel({ text: "analyze the pros and cons" });
    expect(d.taskClass).toBe("reasoning");
  });

  it("'analyse' (British spelling) also triggers reasoning", () => {
    const d = routeModel({ text: "analyse the dataset" });
    expect(d.taskClass).toBe("reasoning");
  });

  it("'compare' triggers reasoning class", () => {
    const d = routeModel({ text: "compare Redis to Memcached" });
    expect(d.taskClass).toBe("reasoning");
  });

  it("'trade-offs' triggers reasoning class", () => {
    const d = routeModel({ text: "what are the trade-offs?" });
    expect(d.taskClass).toBe("reasoning");
  });

  it("'tradeoffs' (no hyphen) triggers reasoning class", () => {
    const d = routeModel({ text: "what are the tradeoffs here?" });
    expect(d.taskClass).toBe("reasoning");
  });

  it("'derive' triggers reasoning class", () => {
    const d = routeModel({ text: "derive the formula for variance" });
    expect(d.taskClass).toBe("reasoning");
  });
});

// ---------------------------------------------------------------------------
// § 3  Priority cascade: declaredTaskClass > image > tools > text > chars
// ---------------------------------------------------------------------------

describe("routeModel — inference priority cascade", () => {
  it("declaredTaskClass beats hasImage (explicit class wins)", () => {
    const d = routeModel({
      text: "describe image",
      hasImage: true,
      declaredTaskClass: "code",
    });
    expect(d.taskClass).toBe("code");
  });

  it("declaredTaskClass beats hasTools", () => {
    const d = routeModel({
      text: "look it up",
      hasTools: true,
      declaredTaskClass: "reasoning",
    });
    expect(d.taskClass).toBe("reasoning");
  });

  it("declaredTaskClass beats text heuristics", () => {
    const d = routeModel({
      text: "explain step by step",
      declaredTaskClass: "quick_rewrite",
    });
    expect(d.taskClass).toBe("quick_rewrite");
  });

  it("hasImage beats hasTools (vision before tool_use)", () => {
    const d = routeModel({
      text: "use tools on this image",
      hasImage: true,
      hasTools: true,
    });
    expect(d.taskClass).toBe("vision");
  });

  it("hasImage beats code-pattern text", () => {
    const d = routeModel({ text: "```js\nconst x = 1\n```", hasImage: true });
    expect(d.taskClass).toBe("vision");
  });

  it("hasImage beats long_context threshold", () => {
    const d = routeModel({ text: "hi", hasImage: true, totalChars: 100_000 });
    expect(d.taskClass).toBe("vision");
  });

  it("hasTools beats code-pattern text", () => {
    const d = routeModel({ text: "look this up ```js``` ", hasTools: true });
    expect(d.taskClass).toBe("tool_use");
  });

  it("totalChars >= LONG_CONTEXT_CHARS beats general text classification", () => {
    // Plain text, no code/rewrite/reasoning keywords, but over the threshold.
    const d = routeModel({ text: "continue", totalChars: LONG_CONTEXT_CHARS });
    expect(d.taskClass).toBe("long_context");
  });

  it("code text pattern beats long_context (text runs before totalChars check)", () => {
    // inferTaskClass checks CODE_RE before totalChars.
    const d = routeModel({
      text: "fix this ```js\nconst x = 1\n```",
      totalChars: 100_000,
    });
    expect(d.taskClass).toBe("code");
  });
});

// ---------------------------------------------------------------------------
// § 4  LONG_CONTEXT_CHARS exact boundary
// ---------------------------------------------------------------------------

describe("routeModel — LONG_CONTEXT_CHARS exact boundary", () => {
  it("totalChars === LONG_CONTEXT_CHARS activates long_context", () => {
    const d = routeModel({ text: "continue", totalChars: LONG_CONTEXT_CHARS });
    expect(d.taskClass).toBe("long_context");
  });

  it("totalChars === LONG_CONTEXT_CHARS - 1 stays general", () => {
    const d = routeModel({
      text: "continue",
      totalChars: LONG_CONTEXT_CHARS - 1,
    });
    expect(d.taskClass).toBe("general");
  });

  it("totalChars === LONG_CONTEXT_CHARS + 1 activates long_context", () => {
    const d = routeModel({
      text: "continue",
      totalChars: LONG_CONTEXT_CHARS + 1,
    });
    expect(d.taskClass).toBe("long_context");
  });

  it("totalChars === 0 (default) with plain text stays general", () => {
    const d = routeModel({ text: "hello world", totalChars: 0 });
    expect(d.taskClass).toBe("general");
  });
});

// ---------------------------------------------------------------------------
// § 5  Allow-list filtering — exhaustive edge cases
// ---------------------------------------------------------------------------

describe("routeModel — allow-list: object-form entries", () => {
  it("empty allowedModels array (explicit) = no restriction", () => {
    const d = routeModel({
      text: "explain step by step",
      allowedModels: [],
    });
    // reasoning → frontier
    expect(d.model.model).toBe(TIER_MODEL.frontier.model);
  });

  it("allow-list containing only the frontier model routes reasoning there", () => {
    const d = routeModel({
      text: "explain step by step",
      allowedModels: [{ provider: "openRouter", model: "kimi-k2.6" }],
    });
    expect(d.model.model).toBe("kimi-k2.6");
  });

  it("allow-list with wrong provider does not match", () => {
    const d = routeModel({
      text: "explain step by step",
      allowedModels: [{ provider: "azure", model: "kimi-k2.6" }],
    });
    // No match → falls back to top tier for reasoning (frontier = kimi-k2.6)
    expect(d.model.model).toBe("kimi-k2.6");
  });

  it("allow-list with wrong model name does not match", () => {
    const d = routeModel({
      text: "fix this ```ts\nconst x = 1\n```",
      allowedModels: [{ provider: "openRouter", model: "nonexistent" }],
    });
    // code → balanced as top tier, fallback when unmatched
    expect(d.model.model).toBe(TIER_MODEL.balanced.model);
  });
});

describe("routeModel — allow-list: string-form (bare ID) entries", () => {
  it("bare string ID matches correctly for reasoning class", () => {
    const d = routeModel({
      text: "explain why step by step",
      allowedModels: ["kimi-k2.6"],
    });
    expect(d.model.model).toBe("kimi-k2.6");
  });

  it("bare string ID that is not in the tier list causes fallback", () => {
    const d = routeModel({
      text: "hello world",
      allowedModels: ["nonexistent-model-id"],
    });
    // general → fast tier (top) as fallback
    expect(d.model.model).toBe(TIER_MODEL.fast.model);
  });

  it("multiple bare string IDs - first matching tier wins", () => {
    const d = routeModel({
      text: "explain why, step by step",
      allowedModels: ["deepseek-v4-pro", "kimi-k2.6"],
    });
    // reasoning prefers frontier (kimi-k2.6) which IS in the list
    expect(d.model.model).toBe("kimi-k2.6");
  });
});

describe("routeModel — allow-list: mixed string + object entries", () => {
  it("mix of string and object entries both match against tier candidates", () => {
    const d = routeModel({
      text: "explain why, step by step",
      allowedModels: [
        "deepseek-v4-pro", // bare string
        { provider: "openRouter", model: "kimi-k2.6" }, // object
      ],
    });
    // reasoning: frontier first (kimi-k2.6) which is in the list via object form
    expect(d.model.model).toBe("kimi-k2.6");
  });

  it("string and object for the SAME model does not duplicate candidates", () => {
    const d = routeModel({
      text: "explain why, step by step",
      allowedModels: [
        "deepseek-v4-pro",
        { provider: "openRouter", model: "deepseek-v4-pro" },
      ],
    });
    // candidates for reasoning that match: balanced (deepseek-v4-pro) appears once
    const balancedCount = d.candidates.filter(
      (c) => c.model === "deepseek-v4-pro",
    ).length;
    expect(balancedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// § 6  Fallback mechanics when allow-list blocks all tiers
// ---------------------------------------------------------------------------

describe("routeModel — fallback when allow-list blocks all tiers", () => {
  it("unrecognized models in allow-list → top tier of the task class is used", () => {
    // vision: top tier = fast (deepseek-v4-flash)
    const d = routeModel({
      text: "what is in this image",
      hasImage: true,
      allowedModels: ["totally-unknown"],
    });
    expect(d.model.model).toBe(TIER_MODEL.fast.model);
    expect(d.tier).toBe("fast");
  });

  it("fallback model always belongs to openRouter provider", () => {
    const d = routeModel({
      text: "code here",
      allowedModels: [{ provider: "openRouter", model: "no-such-model" }],
    });
    expect(d.model.provider).toBe("openRouter");
  });

  it("candidates list in fallback scenario contains exactly the top-tier model", () => {
    const d = routeModel({
      text: "translate hello",
      allowedModels: ["blocked-model"],
    });
    // quick_rewrite fallback top = cheap = deepseek-v4-flash
    expect(d.candidates).toHaveLength(1);
    expect(d.candidates[0].model).toBe(TIER_MODEL.cheap.model);
  });
});

// ---------------------------------------------------------------------------
// § 7  RoutingDecision structural invariants
// ---------------------------------------------------------------------------

describe("routeModel — decision shape invariants across all task classes", () => {
  const allInputs = [
    { text: "fix ```ts\nconst x\n```" }, // code
    { text: "explain why step by step" }, // reasoning
    { text: "continue", totalChars: LONG_CONTEXT_CHARS + 1 }, // long_context
    { text: "describe this", hasImage: true }, // vision
    { text: "look this up", hasTools: true }, // tool_use
    { text: "translate 'hi' to Spanish" }, // quick_rewrite
    { text: "hello there" }, // general
  ] as const;

  it("every decision has exactly the required top-level keys", () => {
    const requiredKeys = [
      "model",
      "taskClass",
      "tier",
      "reason",
      "candidates",
    ] as const;
    for (const input of allInputs) {
      const d = routeModel(input);
      for (const key of requiredKeys) {
        expect(
          d,
          `missing key ${key} for input ${JSON.stringify(input)}`,
        ).toHaveProperty(key);
      }
    }
  });

  it("model.provider is always 'openRouter'", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(d.model.provider).toBe("openRouter");
    }
  });

  it("model.model is always a non-empty string", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(typeof d.model.model).toBe("string");
      expect(d.model.model.length).toBeGreaterThan(0);
    }
  });

  it("candidates[0] always equals model", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(d.candidates[0]).toEqual(d.model);
    }
  });

  it("reason always contains the taskClass string", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(d.reason).toContain(d.taskClass);
    }
  });

  it("reason always contains the tier name", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(d.reason).toContain(d.tier);
    }
  });

  it("tier is always one of the four defined tiers", () => {
    const VALID_TIERS = new Set(["frontier", "balanced", "fast", "cheap"]);
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(VALID_TIERS.has(d.tier), `unknown tier: ${d.tier}`).toBe(true);
    }
  });

  it("taskClass is always one of the seven defined classes", () => {
    const VALID_CLASSES = new Set([
      "code",
      "reasoning",
      "long_context",
      "vision",
      "tool_use",
      "quick_rewrite",
      "general",
    ]);
    for (const input of allInputs) {
      const d = routeModel(input);
      expect(
        VALID_CLASSES.has(d.taskClass),
        `unknown taskClass: ${d.taskClass}`,
      ).toBe(true);
    }
  });

  it("candidates array only contains openRouter models", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      for (const c of d.candidates) {
        expect(c.provider).toBe("openRouter");
      }
    }
  });

  it("every model in candidates is a cost-stack model (not a premium entitlement model)", () => {
    for (const input of allInputs) {
      const d = routeModel(input);
      for (const c of d.candidates) {
        expect(COST_STACK_MODELS as readonly string[]).toContain(c.model);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// § 8  TASK_TIERS / TIER_MODEL cross-validation
// ---------------------------------------------------------------------------

describe("TASK_TIERS and TIER_MODEL cross-validation", () => {
  it("every tier referenced in TASK_TIERS maps to a model in TIER_MODEL", () => {
    for (const [cls, tiers] of Object.entries(TASK_TIERS)) {
      for (const tier of tiers) {
        expect(
          TIER_MODEL[tier as keyof typeof TIER_MODEL],
          `${cls}→${tier} not in TIER_MODEL`,
        ).toBeDefined();
      }
    }
  });

  it("TIER_MODEL models are all in the cost-stack (never a premium model)", () => {
    for (const entry of Object.values(TIER_MODEL)) {
      expect(COST_STACK_MODELS as readonly string[]).toContain(entry.model);
    }
  });

  it("premium models are not auto-routable (not reachable without an allow-list override)", () => {
    // The routing system should never produce a premium model unless it's in the allow-list.
    // Since TIER_MODEL only contains cost-stack models, a plain route call never reaches premium.
    for (const input of [
      { text: "anything" },
      { text: "explain why step by step" },
    ]) {
      const d = routeModel(input);
      expect(PREMIUM_MODELS as readonly string[]).not.toContain(d.model.model);
    }
  });

  it("code task uses balanced as first preference", () => {
    expect(TASK_TIERS.code[0]).toBe("balanced");
  });

  it("reasoning task uses frontier as first preference", () => {
    expect(TASK_TIERS.reasoning[0]).toBe("frontier");
  });

  it("vision task uses fast as first preference", () => {
    expect(TASK_TIERS.vision[0]).toBe("fast");
  });

  it("quick_rewrite task uses cheap as first preference", () => {
    expect(TASK_TIERS.quick_rewrite[0]).toBe("cheap");
  });

  it("general task uses fast as first preference", () => {
    expect(TASK_TIERS.general[0]).toBe("fast");
  });

  it("tool_use task uses balanced as first preference", () => {
    expect(TASK_TIERS.tool_use[0]).toBe("balanced");
  });

  it("long_context task uses balanced as first preference", () => {
    expect(TASK_TIERS.long_context[0]).toBe("balanced");
  });
});

// ---------------------------------------------------------------------------
// § 9  resolveModelAllowList — pure composition deep cases
// ---------------------------------------------------------------------------

describe("resolveModelAllowList — inherit mode exhaustive paths", () => {
  const BASE = ["model-a", "model-b", "model-c"];

  it("inherit with empty add and empty remove passes base through unchanged", () => {
    const result = resolveModelAllowList(BASE, {
      mode: "inherit",
      add: [],
      remove: [],
    });
    expect(result).toEqual(BASE);
  });

  it("inherit with undefined add/remove passes base through unchanged", () => {
    const result = resolveModelAllowList(BASE, { mode: "inherit" });
    expect(result).toEqual(BASE);
  });

  it("inherit removes all base models, leaving only the added ones", () => {
    const result = resolveModelAllowList(BASE, {
      mode: "inherit",
      add: ["model-x"],
      remove: ["model-a", "model-b", "model-c"],
    });
    expect(result).toEqual(["model-x"]);
  });

  it("inherit add+remove where add is also removed yields empty (item in both)", () => {
    // add:["model-x"], remove:["model-x"] — item is added then filtered out
    const result = resolveModelAllowList(BASE, {
      mode: "inherit",
      add: ["model-x"],
      remove: ["model-a", "model-b", "model-c", "model-x"],
    });
    expect(result).toEqual([]);
  });

  it("inherit dedupes when add list contains items already in base", () => {
    const result = resolveModelAllowList(BASE, {
      mode: "inherit",
      add: ["model-a", "model-b", "model-x"],
    });
    expect(result).toEqual(["model-a", "model-b", "model-c", "model-x"]);
  });

  it("inherit dedupes when add list has duplicates", () => {
    const result = resolveModelAllowList(BASE, {
      mode: "inherit",
      add: ["model-x", "model-x"],
    });
    expect(result).toEqual(["model-a", "model-b", "model-c", "model-x"]);
  });

  it("inherit with null base and adds yields just the adds (minus removes)", () => {
    const result = resolveModelAllowList(null, {
      mode: "inherit",
      add: ["model-x", "model-y"],
      remove: ["model-y"],
    });
    expect(result).toEqual(["model-x"]);
  });

  it("inherit with null base and no adds returns null (unrestricted stays unrestricted)", () => {
    const result = resolveModelAllowList(null, { mode: "inherit" });
    expect(result).toBeNull();
  });

  it("inherit with null base and only a remove list returns null (cannot enumerate 'all minus X')", () => {
    const result = resolveModelAllowList(null, {
      mode: "inherit",
      remove: ["model-a"],
    });
    expect(result).toBeNull();
  });
});

describe("resolveModelAllowList — replace mode exhaustive paths", () => {
  const BASE = ["model-a", "model-b"];

  it("replace with a list completely ignores the base", () => {
    const result = resolveModelAllowList(BASE, {
      mode: "replace",
      models: ["model-x"],
    });
    expect(result).toEqual(["model-x"]);
  });

  it("replace with undefined models yields an empty list (no models allowed)", () => {
    const result = resolveModelAllowList(BASE, { mode: "replace" });
    expect(result).toEqual([]);
  });

  it("replace with null base also ignores the base", () => {
    const result = resolveModelAllowList(null, {
      mode: "replace",
      models: ["model-x"],
    });
    expect(result).toEqual(["model-x"]);
  });

  it("replace dedupes duplicates in the replacement list", () => {
    const result = resolveModelAllowList(BASE, {
      mode: "replace",
      models: ["model-x", "model-x", "model-y"],
    });
    expect(result).toEqual(["model-x", "model-y"]);
  });

  it("replace with empty models array yields empty (full restriction)", () => {
    const result = resolveModelAllowList(BASE, { mode: "replace", models: [] });
    expect(result).toEqual([]);
  });
});

describe("resolveModelAllowList — no-override (null policy) paths", () => {
  it("null policy with non-null base passes base through", () => {
    const BASE = ["model-a", "model-b"];
    expect(resolveModelAllowList(BASE, null)).toEqual(BASE);
  });

  it("null policy with null base yields null (unrestricted)", () => {
    expect(resolveModelAllowList(null, null)).toBeNull();
  });

  it("null policy with empty legacy list passes null base through (no legacy override)", () => {
    expect(resolveModelAllowList(null, null, [])).toBeNull();
  });

  it("null policy with non-empty legacy list applies it as replace override", () => {
    const result = resolveModelAllowList(["model-a"], null, ["legacy-only"]);
    expect(result).toEqual(["legacy-only"]);
  });

  it("explicit model_policy takes precedence over legacy list", () => {
    const result = resolveModelAllowList(
      ["model-a"],
      { mode: "inherit", add: ["model-b"] },
      ["legacy-should-be-ignored"],
    );
    expect(result).toEqual(["model-a", "model-b"]);
  });
});

// ---------------------------------------------------------------------------
// § 10  RoutingRequestSchema Zod coercion
// ---------------------------------------------------------------------------

describe("RoutingRequestSchema — Zod coercion and defaults", () => {
  it("omitting text defaults to empty string", () => {
    const parsed = RoutingRequestSchema.parse({});
    expect(parsed.text).toBe("");
  });

  it("omitting hasImage defaults to false", () => {
    const parsed = RoutingRequestSchema.parse({ text: "hi" });
    expect(parsed.hasImage).toBe(false);
  });

  it("omitting hasTools defaults to false", () => {
    const parsed = RoutingRequestSchema.parse({ text: "hi" });
    expect(parsed.hasTools).toBe(false);
  });

  it("omitting totalChars defaults to 0", () => {
    const parsed = RoutingRequestSchema.parse({ text: "hi" });
    expect(parsed.totalChars).toBe(0);
  });

  it("omitting allowedModels leaves it undefined", () => {
    const parsed = RoutingRequestSchema.parse({ text: "hi" });
    expect(parsed.allowedModels).toBeUndefined();
  });

  it("rejects negative totalChars (must be nonnegative int)", () => {
    expect(() =>
      RoutingRequestSchema.parse({ text: "hi", totalChars: -1 }),
    ).toThrow();
  });

  it("rejects non-integer totalChars", () => {
    expect(() =>
      RoutingRequestSchema.parse({ text: "hi", totalChars: 1.5 }),
    ).toThrow();
  });

  it("accepts all valid task class values for declaredTaskClass", () => {
    for (const cls of [
      "code",
      "reasoning",
      "long_context",
      "vision",
      "tool_use",
      "quick_rewrite",
      "general",
    ] as const) {
      const parsed = RoutingRequestSchema.parse({
        text: "hi",
        declaredTaskClass: cls,
      });
      expect(parsed.declaredTaskClass).toBe(cls);
    }
  });

  it("rejects an invalid declaredTaskClass value", () => {
    expect(() =>
      RoutingRequestSchema.parse({
        text: "hi",
        declaredTaskClass: "not-a-class",
      }),
    ).toThrow();
  });

  it("allowedModels accepts an array of bare strings", () => {
    const parsed = RoutingRequestSchema.parse({
      text: "hi",
      allowedModels: ["model-a", "model-b"],
    });
    expect(parsed.allowedModels).toEqual(["model-a", "model-b"]);
  });

  it("allowedModels accepts an array of {provider, model} objects", () => {
    const parsed = RoutingRequestSchema.parse({
      text: "hi",
      allowedModels: [{ provider: "openRouter", model: "kimi-k2.6" }],
    });
    expect(parsed.allowedModels).toHaveLength(1);
  });

  it("allowedModels accepts a mixed array of strings and objects", () => {
    const parsed = RoutingRequestSchema.parse({
      text: "hi",
      allowedModels: ["model-a", { provider: "p", model: "m" }],
    });
    expect(parsed.allowedModels).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// § 11  Inline enforcement predicate (extracted from /api/chat/route.ts)
// ---------------------------------------------------------------------------

/**
 * Mirrors the isModelAllowed guard in app/api/chat/route.ts.
 * Tested independently so routing changes don't silently break the gate.
 */
function isModelAllowed(
  modelId: string | undefined,
  allowList: string[],
): boolean {
  if (allowList.length === 0) return true;
  if (!modelId) return true;
  return allowList.includes(modelId);
}

describe("isModelAllowed — enforcement predicate", () => {
  it("empty allow-list = unrestricted (any model passes)", () => {
    expect(isModelAllowed("gpt-5.5", [])).toBe(true);
    expect(isModelAllowed("some-unknown", [])).toBe(true);
    expect(isModelAllowed(undefined, [])).toBe(true);
  });

  it("model in the allow-list passes", () => {
    expect(
      isModelAllowed("kimi-k2.6", ["kimi-k2.6", "deepseek-v4-flash"]),
    ).toBe(true);
  });

  it("model not in a non-empty allow-list is blocked", () => {
    expect(isModelAllowed("claude-opus-4.8", ["gpt-5.5"])).toBe(false);
  });

  it("undefined modelId (auto-routed) always passes even with a restricted list", () => {
    expect(isModelAllowed(undefined, ["gpt-5.5"])).toBe(true);
  });

  it("empty-string modelId is falsy and passes (treated as auto-routed)", () => {
    expect(isModelAllowed("", ["gpt-5.5"])).toBe(true);
  });

  it("check is case-sensitive (uppercase model ID is blocked)", () => {
    expect(isModelAllowed("GPT-5.5", ["gpt-5.5"])).toBe(false);
  });

  it("a premium model is blocked when only cost-stack models are in the allow-list", () => {
    const costStackOnly = [...COST_STACK_MODELS];
    expect(isModelAllowed("gpt-5.5", costStackOnly)).toBe(false);
    expect(isModelAllowed("claude-opus-4.8", costStackOnly)).toBe(false);
  });

  it("a cost-stack model is allowed when the list contains only cost-stack models", () => {
    const costStackOnly = [...COST_STACK_MODELS];
    for (const m of COST_STACK_MODELS) {
      expect(isModelAllowed(m, costStackOnly)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// § 12  MODEL_PRICES completeness against approved registry
// ---------------------------------------------------------------------------

describe("MODEL_PRICES completeness", () => {
  it("every cost-stack tier model has a price entry", () => {
    for (const entry of Object.values(TIER_MODEL)) {
      expect(
        MODEL_PRICES,
        `Missing price for tier model "${entry.model}"`,
      ).toHaveProperty(entry.model);
    }
  });

  it("every premium model has a price entry", () => {
    for (const m of PREMIUM_MODELS) {
      expect(
        MODEL_PRICES,
        `Missing price for premium model "${m}"`,
      ).toHaveProperty(m);
    }
  });

  it("all price entries have positive inPerMTok", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(
        prices.inPerMTok,
        `${model}: inPerMTok must be > 0`,
      ).toBeGreaterThan(0);
    }
  });

  it("all price entries have positive outPerMTok", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(
        prices.outPerMTok,
        `${model}: outPerMTok must be > 0`,
      ).toBeGreaterThan(0);
    }
  });

  it("cost-stack models are all cheaper than premium models (input per MTok)", () => {
    const premiumMaxIn = Math.max(
      ...PREMIUM_MODELS.map((m) => MODEL_PRICES[m].inPerMTok),
    );
    const costStackMaxIn = Math.max(
      ...COST_STACK_MODELS.map((m) => MODEL_PRICES[m].inPerMTok),
    );
    expect(costStackMaxIn).toBeLessThan(premiumMaxIn);
  });

  it("frontier tier (kimi-k2.6) is the most expensive cost-stack model", () => {
    const frontierIn = MODEL_PRICES["kimi-k2.6"].inPerMTok;
    for (const m of COST_STACK_MODELS.filter((x) => x !== "kimi-k2.6")) {
      expect(frontierIn).toBeGreaterThanOrEqual(MODEL_PRICES[m].inPerMTok);
    }
  });
});

// ---------------------------------------------------------------------------
// § 13  Guardrail strictness ordering (pure logic extracted)
// ---------------------------------------------------------------------------

/**
 * Mirrors the stricterGuardrail helper in lib/admin/teams.ts so we can test
 * the ordering table without needing a DB. Any change to the strictness ranks
 * must be reflected here.
 */
const GUARDRAIL_STRICTNESS: Record<string, number> = {
  permissive: 0,
  standard: 1,
  strict: 2,
};

function stricterGuardrail(a: string, b: string): string {
  const ra = GUARDRAIL_STRICTNESS[a] ?? GUARDRAIL_STRICTNESS.standard;
  const rb = GUARDRAIL_STRICTNESS[b] ?? GUARDRAIL_STRICTNESS.standard;
  return ra >= rb ? a : b;
}

describe("stricterGuardrail — ordering invariants", () => {
  it("strict beats standard", () => {
    expect(stricterGuardrail("strict", "standard")).toBe("strict");
    expect(stricterGuardrail("standard", "strict")).toBe("strict");
  });

  it("strict beats permissive", () => {
    expect(stricterGuardrail("strict", "permissive")).toBe("strict");
    expect(stricterGuardrail("permissive", "strict")).toBe("strict");
  });

  it("standard beats permissive", () => {
    expect(stricterGuardrail("standard", "permissive")).toBe("standard");
    expect(stricterGuardrail("permissive", "standard")).toBe("standard");
  });

  it("same level returns that level", () => {
    expect(stricterGuardrail("strict", "strict")).toBe("strict");
    expect(stricterGuardrail("standard", "standard")).toBe("standard");
    expect(stricterGuardrail("permissive", "permissive")).toBe("permissive");
  });

  it("unknown posture falls back to standard (rank 1)", () => {
    // Unknown → standard rank; standard beats permissive
    expect(stricterGuardrail("unknown-posture", "permissive")).toBe(
      "unknown-posture",
    );
    // Unknown → standard rank; strict beats standard
    expect(stricterGuardrail("unknown-posture", "strict")).toBe("strict");
  });

  it("multi-team reduce across all postures yields strict when one team is strict", () => {
    const teams = ["standard", "permissive", "strict", "standard"];
    const result = teams.reduce(stricterGuardrail, "permissive");
    expect(result).toBe("strict");
  });

  it("multi-team reduce with no strict team stays at standard when one is standard", () => {
    const teams = ["permissive", "standard", "permissive"];
    const result = teams.reduce(stricterGuardrail, "permissive");
    expect(result).toBe("standard");
  });

  it("multi-team reduce with all permissive stays permissive", () => {
    const teams = ["permissive", "permissive", "permissive"];
    const result = teams.reduce(stricterGuardrail, "permissive");
    expect(result).toBe("permissive");
  });
});

// ---------------------------------------------------------------------------
// § 14  routeModel — task-class → tier → model round-trip assertions
// ---------------------------------------------------------------------------

describe("routeModel — task-class / tier / model round-trip", () => {
  it("code: balanced → deepseek-v4-pro", () => {
    const d = routeModel({ text: "fix ```ts\nconst x = 1\n```" });
    expect(d.taskClass).toBe("code");
    expect(d.tier).toBe("balanced");
    expect(d.model.model).toBe("deepseek-v4-pro");
  });

  it("reasoning: frontier → kimi-k2.6", () => {
    const d = routeModel({ text: "derive the time complexity step by step" });
    expect(d.taskClass).toBe("reasoning");
    expect(d.tier).toBe("frontier");
    expect(d.model.model).toBe("kimi-k2.6");
  });

  it("long_context: balanced → deepseek-v4-pro", () => {
    const d = routeModel({ text: "review this", totalChars: 20_000 });
    expect(d.taskClass).toBe("long_context");
    expect(d.tier).toBe("balanced");
    expect(d.model.model).toBe("deepseek-v4-pro");
  });

  it("vision: fast → deepseek-v4-flash", () => {
    const d = routeModel({ text: "what is this?", hasImage: true });
    expect(d.taskClass).toBe("vision");
    expect(d.tier).toBe("fast");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("tool_use: balanced → deepseek-v4-pro", () => {
    const d = routeModel({ text: "look this up", hasTools: true });
    expect(d.taskClass).toBe("tool_use");
    expect(d.tier).toBe("balanced");
    expect(d.model.model).toBe("deepseek-v4-pro");
  });

  it("quick_rewrite: cheap → deepseek-v4-flash", () => {
    const d = routeModel({ text: "translate 'hello' to French" });
    expect(d.taskClass).toBe("quick_rewrite");
    expect(d.tier).toBe("cheap");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });

  it("general: fast → deepseek-v4-flash", () => {
    const d = routeModel({ text: "hi there!" });
    expect(d.taskClass).toBe("general");
    expect(d.tier).toBe("fast");
    expect(d.model.model).toBe("deepseek-v4-flash");
  });
});
