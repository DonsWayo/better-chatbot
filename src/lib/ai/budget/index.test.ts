import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "./index";

describe("estimateCostUsd", () => {
  it("calculates cost for claude-opus-4.8 at correct per-million rates", () => {
    // 1M prompt tokens @ $15/M + 1M completion tokens @ $75/M = $90
    expect(estimateCostUsd("claude-opus-4.8", 1_000_000, 1_000_000)).toBeCloseTo(90, 4);
  });

  it("calculates cost for gpt-5.1", () => {
    // 1M prompt @ $2.5 + 1M completion @ $10 = $12.50
    expect(estimateCostUsd("gpt-5.1", 1_000_000, 1_000_000)).toBeCloseTo(12.5, 4);
  });

  it("calculates cost for gemini-2.5-flash", () => {
    // 1M prompt @ $0.15 + 1M completion @ $0.60 = $0.75
    expect(estimateCostUsd("gemini-2.5-flash", 1_000_000, 1_000_000)).toBeCloseTo(0.75, 4);
  });

  it("calculates cost for gemini-2.5-flash-lite", () => {
    // 1M prompt @ $0.10 + 1M completion @ $0.40 = $0.50
    expect(estimateCostUsd("gemini-2.5-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(0.5, 4);
  });

  it("uses default pricing for unknown models", () => {
    // default: $1/M prompt + $4/M completion
    expect(estimateCostUsd("unknown-model", 1_000_000, 1_000_000)).toBeCloseTo(5, 4);
  });

  it("returns near-zero cost for zero tokens", () => {
    expect(estimateCostUsd("gpt-5.1", 0, 0)).toBe(0);
  });

  it("scales proportionally for fractional millions", () => {
    // 500k prompt tokens at claude-opus-4.8: 0.5 * $15 = $7.50
    const cost = estimateCostUsd("claude-opus-4.8", 500_000, 0);
    expect(cost).toBeCloseTo(7.5, 4);
  });

  it("prompt and completion tokens are priced independently", () => {
    const promptOnly = estimateCostUsd("claude-opus-4.8", 1_000_000, 0);
    const completionOnly = estimateCostUsd("claude-opus-4.8", 0, 1_000_000);
    expect(promptOnly).toBeCloseTo(15, 4);
    expect(completionOnly).toBeCloseTo(75, 4);
    expect(promptOnly + completionOnly).toBeCloseTo(estimateCostUsd("claude-opus-4.8", 1_000_000, 1_000_000), 4);
  });

  it("completion-only cost for gpt-5.1 is $10 per million", () => {
    expect(estimateCostUsd("gpt-5.1", 0, 1_000_000)).toBeCloseTo(10, 4);
  });

  it("scales linearly — double tokens equals double cost", () => {
    const base = estimateCostUsd("gemini-2.5-flash", 100_000, 100_000);
    const doubled = estimateCostUsd("gemini-2.5-flash", 200_000, 200_000);
    expect(doubled).toBeCloseTo(base * 2, 8);
  });

  it("small token counts (1000 tokens) produce near-zero but non-zero cost for known models", () => {
    const cost = estimateCostUsd("gpt-5.1", 1_000, 1_000);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.1);
  });

  it("default model is always cheaper than claude-opus-4.8", () => {
    const defaultCost = estimateCostUsd("unknown-xyz", 1_000_000, 1_000_000);
    const opusCost = estimateCostUsd("claude-opus-4.8", 1_000_000, 1_000_000);
    expect(defaultCost).toBeLessThan(opusCost);
  });

  it("gemini-2.5-flash-lite is cheapest among known models", () => {
    const liteCost = estimateCostUsd("gemini-2.5-flash-lite", 1_000_000, 1_000_000);
    const flashCost = estimateCostUsd("gemini-2.5-flash", 1_000_000, 1_000_000);
    const gptCost = estimateCostUsd("gpt-5.1", 1_000_000, 1_000_000);
    const opusCost = estimateCostUsd("claude-opus-4.8", 1_000_000, 1_000_000);
    expect(liteCost).toBeLessThan(flashCost);
    expect(liteCost).toBeLessThan(gptCost);
    expect(liteCost).toBeLessThan(opusCost);
  });
});
