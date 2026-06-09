import { describe, it, expect } from "vitest";
import {
  checkConditionBranch,
  getFirstConditionOperator,
  StringConditionOperator,
  NumberConditionOperator,
  BooleanConditionOperator,
} from "./condition";
import type { ConditionBranch } from "./condition";

function branch(
  operator: string,
  value: string | number | boolean,
  logicalOperator: "AND" | "OR" = "AND",
): ConditionBranch {
  return {
    id: "if",
    type: "if",
    logicalOperator,
    conditions: [{ source: "node1.output" as any, operator: operator as any, value }],
  };
}

describe("getFirstConditionOperator", () => {
  it("returns Equals for string", () => {
    expect(getFirstConditionOperator("string")).toBe(StringConditionOperator.Equals);
  });
  it("returns Equals for number", () => {
    expect(getFirstConditionOperator("number")).toBe(NumberConditionOperator.Equals);
  });
  it("returns IsTrue for boolean", () => {
    expect(getFirstConditionOperator("boolean")).toBe(BooleanConditionOperator.IsTrue);
  });
  it("defaults to Equals for unknown type", () => {
    expect(getFirstConditionOperator("unknown" as any)).toBe(StringConditionOperator.Equals);
  });
});

describe("checkConditionBranch — string operators", () => {
  const get = (val: string) => () => val;

  it("Equals: matches exact value", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.Equals, "hello"), get("hello"))).toBe(true);
    expect(checkConditionBranch(branch(StringConditionOperator.Equals, "hello"), get("world"))).toBe(false);
  });

  it("NotEquals: true when different", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.NotEquals, "a"), get("b"))).toBe(true);
    expect(checkConditionBranch(branch(StringConditionOperator.NotEquals, "a"), get("a"))).toBe(false);
  });

  it("Contains", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.Contains, "ell"), get("hello"))).toBe(true);
    expect(checkConditionBranch(branch(StringConditionOperator.Contains, "xyz"), get("hello"))).toBe(false);
  });

  it("NotContains", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.NotContains, "xyz"), get("hello"))).toBe(true);
  });

  it("StartsWith", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.StartsWith, "hel"), get("hello"))).toBe(true);
    expect(checkConditionBranch(branch(StringConditionOperator.StartsWith, "ell"), get("hello"))).toBe(false);
  });

  it("EndsWith", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.EndsWith, "llo"), get("hello"))).toBe(true);
  });

  it("IsEmpty: true when source is empty string", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.IsEmpty, ""), get(""))).toBe(true);
    expect(checkConditionBranch(branch(StringConditionOperator.IsEmpty, ""), get("x"))).toBe(false);
  });

  it("IsNotEmpty: true when source has content", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.IsNotEmpty, ""), get("hello"))).toBe(true);
    expect(checkConditionBranch(branch(StringConditionOperator.IsNotEmpty, ""), get(""))).toBe(false);
  });
});

describe("checkConditionBranch — number operators", () => {
  const get = (val: number) => () => val;

  it("GreaterThan", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThan, 5), get(10))).toBe(true);
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThan, 5), get(3))).toBe(false);
  });

  it("LessThan", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.LessThan, 5), get(3))).toBe(true);
    expect(checkConditionBranch(branch(NumberConditionOperator.LessThan, 5), get(10))).toBe(false);
  });

  it("GreaterThanOrEqual", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThanOrEqual, 5), get(5))).toBe(true);
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThanOrEqual, 5), get(4))).toBe(false);
  });

  it("LessThanOrEqual", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.LessThanOrEqual, 5), get(5))).toBe(true);
    expect(checkConditionBranch(branch(NumberConditionOperator.LessThanOrEqual, 5), get(6))).toBe(false);
  });
});

describe("checkConditionBranch — boolean operators", () => {
  it("IsTrue: true when source is truthy", () => {
    expect(checkConditionBranch(branch(BooleanConditionOperator.IsTrue, true), () => true)).toBe(true);
    expect(checkConditionBranch(branch(BooleanConditionOperator.IsTrue, false), () => false)).toBe(false);
  });

  it("IsFalse: true when source is falsy", () => {
    expect(checkConditionBranch(branch(BooleanConditionOperator.IsFalse, false), () => false)).toBe(true);
    expect(checkConditionBranch(branch(BooleanConditionOperator.IsFalse, true), () => true)).toBe(false);
  });
});

describe("checkConditionBranch — logical operators", () => {
  it("AND: all conditions must pass", () => {
    const b: ConditionBranch = {
      id: "if",
      type: "if",
      logicalOperator: "AND",
      conditions: [
        { source: "n.a" as any, operator: StringConditionOperator.Equals, value: "x" },
        { source: "n.b" as any, operator: StringConditionOperator.Equals, value: "y" },
      ],
    };
    const getVal = (s: string) => (s === "n.a" ? "x" : "y");
    expect(checkConditionBranch(b, getVal as any)).toBe(true);
    const getValFail = (s: string) => (s === "n.a" ? "x" : "z");
    expect(checkConditionBranch(b, getValFail as any)).toBe(false);
  });

  it("OR: at least one condition must pass", () => {
    const b: ConditionBranch = {
      id: "if",
      type: "if",
      logicalOperator: "OR",
      conditions: [
        { source: "n.a" as any, operator: StringConditionOperator.Equals, value: "x" },
        { source: "n.b" as any, operator: StringConditionOperator.Equals, value: "y" },
      ],
    };
    const getValFirst = (s: string) => (s === "n.a" ? "x" : "z");
    expect(checkConditionBranch(b, getValFirst as any)).toBe(true);
    const getValNone = (_s: string) => "nope";
    expect(checkConditionBranch(b, getValNone as any)).toBe(false);
  });
});
