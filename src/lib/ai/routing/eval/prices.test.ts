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

  it("gemini-2.5-flash has correct per-million-token rates", () => {
    const flash = MODEL_PRICES["gemini-2.5-flash"];
    expect(flash.inPerMTok).toBe(0.3);
    expect(flash.outPerMTok).toBe(2.5);
  });

  it("gemini-2.5-flash-lite has correct per-million-token rates", () => {
    const lite = MODEL_PRICES["gemini-2.5-flash-lite"];
    expect(lite.inPerMTok).toBe(0.1);
    expect(lite.outPerMTok).toBe(0.4);
  });

  it("all price values are finite positive numbers (no NaN, no Infinity)", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(Number.isFinite(prices.inPerMTok), `${model}: inPerMTok finite`).toBe(true);
      expect(Number.isFinite(prices.outPerMTok), `${model}: outPerMTok finite`).toBe(true);
    }
  });

  it("output-to-input ratio is at least 2:1 for all models", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(prices.outPerMTok / prices.inPerMTok, `${model}: ratio`).toBeGreaterThanOrEqual(2);
    }
  });

  it("balanced tier (gpt-5.1) is cheaper than frontier (claude-opus-4.8)", () => {
    expect(MODEL_PRICES["gpt-5.1"].outPerMTok).toBeLessThan(MODEL_PRICES["claude-opus-4.8"].outPerMTok);
    expect(MODEL_PRICES["gpt-5.1"].inPerMTok).toBeLessThan(MODEL_PRICES["claude-opus-4.8"].inPerMTok);
  });

  it("fast tier (gemini-2.5-flash) is cheaper than balanced tier (gpt-5.1)", () => {
    expect(MODEL_PRICES["gemini-2.5-flash"].inPerMTok).toBeLessThan(MODEL_PRICES["gpt-5.1"].inPerMTok);
    expect(MODEL_PRICES["gemini-2.5-flash"].outPerMTok).toBeLessThan(MODEL_PRICES["gpt-5.1"].outPerMTok);
  });

  it("all model names in MODEL_PRICES are non-empty strings", () => {
    for (const key of Object.keys(MODEL_PRICES)) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("price object has exactly inPerMTok and outPerMTok fields", () => {
    for (const prices of Object.values(MODEL_PRICES)) {
      expect(Object.keys(prices).sort()).toEqual(["inPerMTok", "outPerMTok"].sort());
    }
  });
});
