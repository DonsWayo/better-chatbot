// Headless tests for the cost-preview pill's formatting logic. There is no
// DOM test runner (@testing-library) in this repo, so the JSX itself is not
// rendered here — the pure formatter carries the component's render logic.
import { describe, expect, it } from "vitest";
import { formatEstimatedUsd } from "./cost-preview";

describe("formatEstimatedUsd", () => {
  it("formats a normal estimate to cents with a ~$ prefix", () => {
    expect(formatEstimatedUsd(0.0235)).toBe("~$0.02");
    expect(formatEstimatedUsd(1.5)).toBe("~$1.50");
  });

  it("returns null when no estimate is provided (pill omits the amount)", () => {
    expect(formatEstimatedUsd(undefined)).toBeNull();
  });

  it("returns null for non-finite values", () => {
    expect(formatEstimatedUsd(Number.NaN)).toBeNull();
    expect(formatEstimatedUsd(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("floors tiny-but-nonzero estimates at <$0.01 instead of showing $0.00", () => {
    expect(formatEstimatedUsd(0.0004)).toBe("<$0.01");
    expect(formatEstimatedUsd(0.0049)).toBe("<$0.01");
  });

  it("shows an exact zero as ~$0.00", () => {
    expect(formatEstimatedUsd(0)).toBe("~$0.00");
  });

  it("rounds half-up at the cent boundary", () => {
    expect(formatEstimatedUsd(0.005)).toBe("~$0.01");
  });
});
