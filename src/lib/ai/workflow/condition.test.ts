import { describe, expect, it } from "vitest";
import {
  checkConditionBranch,
  getFirstConditionOperator,
  StringConditionOperator,
  NumberConditionOperator,
  BooleanConditionOperator,
} from "./condition";
import type { ConditionBranch, ConditionOperator } from "./condition";

const src = (val: unknown) => () => val;

const makeBranch = (
  op: ConditionOperator,
  value: unknown,
  operator: "AND" | "OR" = "AND",
): ConditionBranch => ({
  id: "if",
  type: "if",
  conditions: [
    {
      source: { nodeId: "n1", path: ["val"] },
      operator: op,
      value,
    },
  ],
  logicalOperator: operator,
});

describe("StringConditionOperator — basic evaluations", () => {
  it("Equals matches identical value", () => {
    const branch = makeBranch(StringConditionOperator.Equals, "hello");
    expect(checkConditionBranch(branch, src("hello"))).toBe(true);
  });

  it("Equals rejects different value", () => {
    const branch = makeBranch(StringConditionOperator.Equals, "hello");
    expect(checkConditionBranch(branch, src("world"))).toBe(false);
  });

  it("NotEquals matches different value", () => {
    const branch = makeBranch(StringConditionOperator.NotEquals, "a");
    expect(checkConditionBranch(branch, src("b"))).toBe(true);
  });

  it("NotEquals rejects same value", () => {
    const branch = makeBranch(StringConditionOperator.NotEquals, "same");
    expect(checkConditionBranch(branch, src("same"))).toBe(false);
  });

  it("Contains matches substring", () => {
    const branch = makeBranch(StringConditionOperator.Contains, "ell");
    expect(checkConditionBranch(branch, src("hello"))).toBe(true);
  });

  it("Contains rejects missing substring", () => {
    const branch = makeBranch(StringConditionOperator.Contains, "xyz");
    expect(checkConditionBranch(branch, src("hello"))).toBe(false);
  });

  it("NotContains matches when substring absent", () => {
    const branch = makeBranch(StringConditionOperator.NotContains, "xyz");
    expect(checkConditionBranch(branch, src("hello"))).toBe(true);
  });

  it("StartsWith matches correct prefix", () => {
    const branch = makeBranch(StringConditionOperator.StartsWith, "hel");
    expect(checkConditionBranch(branch, src("hello"))).toBe(true);
  });

  it("StartsWith rejects wrong prefix", () => {
    const branch = makeBranch(StringConditionOperator.StartsWith, "llo");
    expect(checkConditionBranch(branch, src("hello"))).toBe(false);
  });

  it("EndsWith matches correct suffix", () => {
    const branch = makeBranch(StringConditionOperator.EndsWith, "llo");
    expect(checkConditionBranch(branch, src("hello"))).toBe(true);
  });

  it("IsEmpty returns true for empty string", () => {
    const branch = makeBranch(StringConditionOperator.IsEmpty, "");
    expect(checkConditionBranch(branch, src(""))).toBe(true);
  });

  it("IsEmpty returns false for non-empty string", () => {
    const branch = makeBranch(StringConditionOperator.IsEmpty, "");
    expect(checkConditionBranch(branch, src("value"))).toBe(false);
  });

  it("IsNotEmpty returns true for non-empty string", () => {
    const branch = makeBranch(StringConditionOperator.IsNotEmpty, "");
    expect(checkConditionBranch(branch, src("hi"))).toBe(true);
  });
});

describe("NumberConditionOperator — evaluations", () => {
  it("GreaterThan matches when source > target", () => {
    const branch = makeBranch(NumberConditionOperator.GreaterThan, 5);
    expect(checkConditionBranch(branch, src(10))).toBe(true);
  });

  it("GreaterThan rejects when source <= target", () => {
    const branch = makeBranch(NumberConditionOperator.GreaterThan, 10);
    expect(checkConditionBranch(branch, src(5))).toBe(false);
  });

  it("LessThan matches when source < target", () => {
    const branch = makeBranch(NumberConditionOperator.LessThan, 10);
    expect(checkConditionBranch(branch, src(3))).toBe(true);
  });

  it("GreaterThanOrEqual matches equal values", () => {
    const branch = makeBranch(NumberConditionOperator.GreaterThanOrEqual, 5);
    expect(checkConditionBranch(branch, src(5))).toBe(true);
  });

  it("LessThanOrEqual matches equal values", () => {
    const branch = makeBranch(NumberConditionOperator.LessThanOrEqual, 5);
    expect(checkConditionBranch(branch, src(5))).toBe(true);
  });
});

describe("BooleanConditionOperator — evaluations", () => {
  it("IsTrue returns true for truthy value", () => {
    const branch = makeBranch(BooleanConditionOperator.IsTrue, "");
    expect(checkConditionBranch(branch, src(true))).toBe(true);
  });

  it("IsTrue returns false for falsy value", () => {
    const branch = makeBranch(BooleanConditionOperator.IsTrue, "");
    expect(checkConditionBranch(branch, src(false))).toBe(false);
  });

  it("IsFalse returns true for falsy value", () => {
    const branch = makeBranch(BooleanConditionOperator.IsFalse, "");
    expect(checkConditionBranch(branch, src(false))).toBe(true);
  });

  it("IsFalse returns false for truthy value", () => {
    const branch = makeBranch(BooleanConditionOperator.IsFalse, "");
    expect(checkConditionBranch(branch, src(true))).toBe(false);
  });
});

describe("checkConditionBranch — logical operators", () => {
  it("AND: all conditions must be true", () => {
    const branch: ConditionBranch = {
      id: "if",
      type: "if",
      conditions: [
        { source: { nodeId: "n1", path: ["v"] }, operator: StringConditionOperator.Equals, value: "x" },
        { source: { nodeId: "n1", path: ["v"] }, operator: StringConditionOperator.Equals, value: "x" },
      ],
      logicalOperator: "AND",
    };
    expect(checkConditionBranch(branch, src("x"))).toBe(true);
  });

  it("AND: one false condition makes whole branch false", () => {
    const branch: ConditionBranch = {
      id: "if",
      type: "if",
      conditions: [
        { source: { nodeId: "n1", path: ["v"] }, operator: StringConditionOperator.Equals, value: "x" },
        { source: { nodeId: "n1", path: ["v"] }, operator: StringConditionOperator.Equals, value: "y" },
      ],
      logicalOperator: "AND",
    };
    expect(checkConditionBranch(branch, src("x"))).toBe(false);
  });

  it("OR: one true condition makes whole branch true", () => {
    const branch: ConditionBranch = {
      id: "if",
      type: "if",
      conditions: [
        { source: { nodeId: "n1", path: ["v"] }, operator: StringConditionOperator.Equals, value: "x" },
        { source: { nodeId: "n1", path: ["v"] }, operator: StringConditionOperator.Equals, value: "other" },
      ],
      logicalOperator: "OR",
    };
    expect(checkConditionBranch(branch, src("other"))).toBe(true);
  });
});

describe("getFirstConditionOperator", () => {
  it("returns StringConditionOperator.Equals for string", () => {
    expect(getFirstConditionOperator("string")).toBe(StringConditionOperator.Equals);
  });

  it("returns NumberConditionOperator.Equals for number", () => {
    expect(getFirstConditionOperator("number")).toBe(NumberConditionOperator.Equals);
  });

  it("returns BooleanConditionOperator.IsTrue for boolean", () => {
    expect(getFirstConditionOperator("boolean")).toBe(BooleanConditionOperator.IsTrue);
  });

  it("defaults to StringConditionOperator.Equals for unknown types", () => {
    expect(getFirstConditionOperator("unknown" as unknown as "string")).toBe(StringConditionOperator.Equals);
  });
});

describe("checkConditionBranch — return type invariants", () => {
  it("always returns a boolean", () => {
    const branch = makeBranch(StringConditionOperator.Equals, "x");
    for (const val of ["x", "y", undefined, null, 0, true]) {
      expect(typeof checkConditionBranch(branch, src(val))).toBe("boolean");
    }
  });
});
