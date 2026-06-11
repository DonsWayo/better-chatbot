import { describe, expect, it } from "vitest";
import { TIER_MODEL } from "../policy";
import { MODEL_PRICES } from "./prices";

describe("MODEL_PRICES", () => {
  it("has price entries for all tier models", () => {
    for (const { model } of Object.values(TIER_MODEL)) {
      expect(
        MODEL_PRICES[model],
        `missing price for model: ${model}`,
      ).toBeDefined();
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
      expect(prices.outPerMTok, `${model}: out >= in`).toBeGreaterThanOrEqual(
        prices.inPerMTok,
      );
    }
  });

  it("cheap tier is the lowest-priced ROUTED tier (registry may hold cheaper, slower, entitlement-only models like hy3-preview)", () => {
    const tierModels = Object.values(TIER_MODEL).map((m) => m.model);
    const cheap = MODEL_PRICES[TIER_MODEL.cheap.model];
    for (const model of tierModels) {
      expect(
        MODEL_PRICES[model].inPerMTok,
        `${model} >= cheap tier`,
      ).toBeGreaterThanOrEqual(cheap.inPerMTok);
    }
  });

  it("covers the full 7-model approved registry", () => {
    expect(Object.keys(MODEL_PRICES).sort()).toEqual(
      [
        "gpt-5.5",
        "claude-opus-4.8",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "kimi-k2.6",
        "deepseek-v4-pro",
        "deepseek-v4-flash",
      ].sort(),
    );
  });

  it("gpt-5.5 has correct per-million-token rates", () => {
    expect(MODEL_PRICES["gpt-5.5"]).toEqual({ inPerMTok: 5, outPerMTok: 30 });
  });

  it("claude-opus-4.8 has correct per-million-token rates", () => {
    expect(MODEL_PRICES["claude-opus-4.8"]).toEqual({
      inPerMTok: 5,
      outPerMTok: 25,
    });
  });

  it("gemini-3.5-flash has correct per-million-token rates", () => {
    expect(MODEL_PRICES["gemini-3.5-flash"]).toEqual({
      inPerMTok: 1.5,
      outPerMTok: 9,
    });
  });

  it("gemini-3.1-flash-lite has correct per-million-token rates", () => {
    expect(MODEL_PRICES["gemini-3.1-flash-lite"]).toEqual({
      inPerMTok: 0.25,
      outPerMTok: 1.5,
    });
  });

  it("kimi-k2.6 (frontier tier) has correct per-million-token rates", () => {
    expect(MODEL_PRICES["kimi-k2.6"]).toEqual({
      inPerMTok: 0.68,
      outPerMTok: 3.41,
    });
  });

  it("deepseek-v4-pro (balanced tier) has correct per-million-token rates", () => {
    expect(MODEL_PRICES["deepseek-v4-pro"]).toEqual({
      inPerMTok: 0.43,
      outPerMTok: 0.87,
    });
  });

  it("deepseek-v4-flash (fast tier) has correct per-million-token rates", () => {
    expect(MODEL_PRICES["deepseek-v4-flash"]).toEqual({
      inPerMTok: 0.1,
      outPerMTok: 0.2,
    });
  });

  it("every routed tier model is cheaper than every premium model (cost directive)", () => {
    const premium = ["gpt-5.5", "claude-opus-4.8", "gemini-3.5-flash"];
    for (const { model } of Object.values(TIER_MODEL)) {
      for (const p of premium) {
        expect(
          MODEL_PRICES[model].outPerMTok,
          `${model} out < ${p} out`,
        ).toBeLessThan(MODEL_PRICES[p].outPerMTok);
        expect(
          MODEL_PRICES[model].inPerMTok,
          `${model} in < ${p} in`,
        ).toBeLessThan(MODEL_PRICES[p].inPerMTok);
      }
    }
  });

  it("fast tier is cheaper than balanced tier on both axes", () => {
    const fast = MODEL_PRICES[TIER_MODEL.fast.model];
    const balanced = MODEL_PRICES[TIER_MODEL.balanced.model];
    expect(fast.inPerMTok).toBeLessThan(balanced.inPerMTok);
    expect(fast.outPerMTok).toBeLessThan(balanced.outPerMTok);
  });

  it("all price values are finite positive numbers (no NaN, no Infinity)", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(
        Number.isFinite(prices.inPerMTok),
        `${model}: inPerMTok finite`,
      ).toBe(true);
      expect(
        Number.isFinite(prices.outPerMTok),
        `${model}: outPerMTok finite`,
      ).toBe(true);
    }
  });

  it("output-to-input ratio is at least 2:1 for all models", () => {
    for (const [model, prices] of Object.entries(MODEL_PRICES)) {
      expect(
        prices.outPerMTok / prices.inPerMTok,
        `${model}: ratio`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("all model names in MODEL_PRICES are non-empty strings", () => {
    for (const key of Object.keys(MODEL_PRICES)) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("price object has exactly inPerMTok and outPerMTok fields", () => {
    for (const prices of Object.values(MODEL_PRICES)) {
      expect(Object.keys(prices).sort()).toEqual(
        ["inPerMTok", "outPerMTok"].sort(),
      );
    }
  });
});
