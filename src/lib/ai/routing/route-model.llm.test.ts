import { generateText } from "ai";
import { describe, expect, it } from "vitest";

import { customModelProvider } from "../models";
import { routeModel } from "./route-model";

// Opt-in real-LLM tier (RUN_LLM_TESTS=1 pnpm test:llm) — see vitest.llm.config.ts.
const RUN = Boolean(
  process.env.OPENROUTER_API_KEY && process.env.RUN_LLM_TESTS === "1",
);

describe.skipIf(!RUN)("routeModel → real model integration", () => {
  // routeModel itself is pure (ADR-0004 heuristics) — these assertions pin the
  // representative routes before we spend money on one of them below.
  it("routes code, quick-rewrite and general inputs deterministically", () => {
    const code = routeModel({
      text: "fix this function ```ts\nconst x = 1;\n```",
    });
    expect(code.taskClass).toBe("code");
    expect(code.model).toEqual({ provider: "openRouter", model: "gpt-5.5" });

    const rewrite = routeModel({ text: "summarize this paragraph please" });
    expect(rewrite.taskClass).toBe("quick_rewrite");
    expect(rewrite.tier).toBe("cheap");
    expect(rewrite.model).toEqual({
      provider: "openRouter",
      model: "gemini-3.1-flash-lite",
    });

    const general = routeModel({ text: "hello there" });
    expect(general.taskClass).toBe("general");
    expect(general.model).toEqual({
      provider: "openRouter",
      model: "gemini-3.5-flash",
    });
  });

  it("honours an entitlement allow-list", () => {
    const decision = routeModel({
      text: "hello there",
      allowedModels: ["gemini-3.1-flash-lite"],
    });
    expect(decision.model.model).toBe("gemini-3.1-flash-lite");
    expect(decision.candidates).toHaveLength(1);
  });

  it(
    "the routed (cheapest) model answers through customModelProvider.getModel",
    { timeout: 30_000 },
    async () => {
      // quick_rewrite routes to the cheap tier — the only route we pay for here.
      const decision = routeModel({ text: "summarize: hello world" });
      expect(decision.tier).toBe("cheap");

      const { text } = await generateText({
        model: customModelProvider.getModel(decision.model),
        prompt: "Reply with the single word OK",
        maxOutputTokens: 16,
      });
      expect(text.trim().length).toBeGreaterThan(0);
    },
  );
});
