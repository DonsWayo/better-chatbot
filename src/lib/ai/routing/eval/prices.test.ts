import { describe, it, expect } from "vitest";
import { MODEL_PRICES } from "./prices";
import { TIER_MODEL } from "../policy";

describe("MODEL_PRICES", () => {
  it("has price entries for all tier models", () => {
    for (const { model } of Object.values(TIER_MODEL)) {
      expect(MODEL_PRICES[model], `missing price for model: ${model}`).toBeDefined();
    }
  });

  it("each price entry has positive inPerMTok and outPerMTok", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(prices.inPerMTok, `${model}: inPerMTok`).toBeGreaterThan(0);
      expect(prices.outPerMTok, `${model}: outPerMTok`).toBeGreaterThan(0);
    }
  });

  it("output price is always >= input price (output tokens cost more)", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(prices.outPerMTok, `${model}: out >= in`).toBeGreaterThanOrEqual(prices.inPerMTok);
    }
  });

  it("frontier model (claude-opus) is the most expensive", () => {
    const opusModel = TIER_MODEL.frontier.model;
    const opusOut = MODEL_PRICES[opusModel].outPerMTok;
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      if (model === opusModel) continue;
      expect(prices.outPerMTok).toBeLessThanOrEqual(opusOut);
    }
  });

  it("cheap model has lowest prices", () => {
    const cheapModel = TIER_MODEL.cheap.model;
    const cheapIn = MODEL_PRICES[cheapModel].inPerMTok;
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      if (model === cheapModel) continue;
      expect(prices.inPerMTok).toBeGreaterThanOrEqual(cheapIn);
    }
  });

  it("has exactly four model price entries", () => {
    expect(Object.keys(MODEL_PRICES)).toHaveLength(4);
  });

  it("claude-opus-4.8 has correct per-million-token rates", () => {
    const opus = MODEL_PRICES["claude-opus-4.8"];
    expect(opus.inPerMTok).toBe(5);
    expect(opus.outPerMTok).toBe(25);
  });

  it("gpt-5.1 has correct per-million-token rates", () => {
    const gpt = MODEL_PRICES["gpt-5.1"];
    expect(gpt.inPerMTok).toBe(1.25);
    expect(gpt.outPerMTok).toBe(10);
  });

  it("gemini-2.5-flash-lite is the cheapest model overall", () => {
    const lite = MODEL_PRICES["gemini-2.5-flash-lite"];
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      if (model === "gemini-2.5-flash-lite") continue;
      expect(prices.inPerMTok).toBeGreaterThanOrEqual(lite.inPerMTok);
      expect(prices.outPerMTok).toBeGreaterThanOrEqual(lite.outPerMTok);
    }
  });

  it("gemini-2.5-flash has higher output price than gemini-2.5-flash-lite", () => {
    expect(MODEL_PRICES["gemini-2.5-flash"].outPerMTok).toBeGreaterThan(
      MODEL_PRICES["gemini-2.5-flash-lite"].outPerMTok,
    );
  });
});
