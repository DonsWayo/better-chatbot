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
});
