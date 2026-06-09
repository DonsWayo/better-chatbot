import { describe, it, expect } from "vitest";
import {
  StringConditionOperator,
  NumberConditionOperator,
  BooleanConditionOperator,
  getFirstConditionOperator,
  checkConditionBranch,
} from "./condition";
import type { ConditionBranch } from "./condition";

function makeSourceFn(values: Record<string, any>) {
  return (key: { nodeId: string; path: string[] }) => {
    const k = `${key.nodeId}.${key.path.join(".")}`;
    return values[k];
  };
}

function src(nodeId: string, path: string[]) {
  return { nodeId, path };
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
  const source = src("n1", ["v"]);
  const getValue = makeSourceFn({ "n1.v": "hello world" });

  function branch(operator: StringConditionOperator, value?: string): ConditionBranch {
    return { id: "if", type: "if", conditions: [{ source, operator, value }], logicalOperator: "AND" };
  }

  it("Equals: matches exact value", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.Equals, "hello world"), getValue)).toBe(true);
  });

  it("Equals: fails on mismatch", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.Equals, "goodbye"), getValue)).toBe(false);
  });

  it("NotEquals: true when values differ", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.NotEquals, "goodbye"), getValue)).toBe(true);
  });

  it("Contains: true when substring present", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.Contains, "world"), getValue)).toBe(true);
  });

  it("NotContains: true when substring absent", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.NotContains, "foo"), getValue)).toBe(true);
  });

  it("StartsWith: true for matching prefix", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.StartsWith, "hello"), getValue)).toBe(true);
  });

  it("EndsWith: true for matching suffix", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.EndsWith, "world"), getValue)).toBe(true);
  });

  it("IsEmpty: true for empty string source", () => {
    const empty = makeSourceFn({ "n1.v": "" });
    expect(checkConditionBranch(branch(StringConditionOperator.IsEmpty), empty)).toBe(true);
  });

  it("IsNotEmpty: true for non-empty source", () => {
    expect(checkConditionBranch(branch(StringConditionOperator.IsNotEmpty), getValue)).toBe(true);
  });
});

describe("checkConditionBranch — number operators", () => {
  const source = src("n1", ["count"]);

  function branch(operator: NumberConditionOperator, value: number): ConditionBranch {
    return { id: "if", type: "if", conditions: [{ source, operator, value }], logicalOperator: "AND" };
  }

  it("GreaterThan: true when source > target", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThan, 5), makeSourceFn({ "n1.count": 10 }))).toBe(true);
  });

  it("LessThan: true when source < target", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.LessThan, 100), makeSourceFn({ "n1.count": 50 }))).toBe(true);
  });

  it("GreaterThanOrEqual: true when source equals target", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThanOrEqual, 10), makeSourceFn({ "n1.count": 10 }))).toBe(true);
  });

  it("LessThanOrEqual: true when source equals target", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.LessThanOrEqual, 5), makeSourceFn({ "n1.count": 5 }))).toBe(true);
  });

  it("GreaterThan: false when source equals target", () => {
    expect(checkConditionBranch(branch(NumberConditionOperator.GreaterThan, 10), makeSourceFn({ "n1.count": 10 }))).toBe(false);
  });
});

describe("checkConditionBranch — boolean operators", () => {
  const source = src("n1", ["flag"]);

  it("IsTrue: true when source is truthy", () => {
    const b: ConditionBranch = { id: "if", type: "if", conditions: [{ source, operator: BooleanConditionOperator.IsTrue }], logicalOperator: "AND" };
    expect(checkConditionBranch(b, makeSourceFn({ "n1.flag": true }))).toBe(true);
  });

  it("IsFalse: true when source is falsy", () => {
    const b: ConditionBranch = { id: "if", type: "if", conditions: [{ source, operator: BooleanConditionOperator.IsFalse }], logicalOperator: "AND" };
    expect(checkConditionBranch(b, makeSourceFn({ "n1.flag": false }))).toBe(true);
  });

  it("IsTrue: false when source is false", () => {
    const b: ConditionBranch = { id: "if", type: "if", conditions: [{ source, operator: BooleanConditionOperator.IsTrue }], logicalOperator: "AND" };
    expect(checkConditionBranch(b, makeSourceFn({ "n1.flag": false }))).toBe(false);
  });
});

describe("checkConditionBranch — logical operators (AND/OR)", () => {
  const s1 = src("n1", ["a"]);
  const s2 = src("n1", ["b"]);
  const values = { "n1.a": "hello", "n1.b": "world" };
  const getOutput = makeSourceFn(values);

  it("AND: true when all conditions pass", () => {
    const b: ConditionBranch = {
      id: "if", type: "if",
      conditions: [
        { source: s1, operator: StringConditionOperator.Equals, value: "hello" },
        { source: s2, operator: StringConditionOperator.Equals, value: "world" },
      ],
      logicalOperator: "AND",
    };
    expect(checkConditionBranch(b, getOutput)).toBe(true);
  });

  it("AND: false when any condition fails", () => {
    const b: ConditionBranch = {
      id: "if", type: "if",
      conditions: [
        { source: s1, operator: StringConditionOperator.Equals, value: "hello" },
        { source: s2, operator: StringConditionOperator.Equals, value: "wrong" },
      ],
      logicalOperator: "AND",
    };
    expect(checkConditionBranch(b, getOutput)).toBe(false);
  });

  it("OR: true when any condition passes", () => {
    const b: ConditionBranch = {
      id: "if", type: "if",
      conditions: [
        { source: s1, operator: StringConditionOperator.Equals, value: "wrong" },
        { source: s2, operator: StringConditionOperator.Equals, value: "world" },
      ],
      logicalOperator: "OR",
    };
    expect(checkConditionBranch(b, getOutput)).toBe(true);
  });

  it("OR: false when all conditions fail", () => {
    const b: ConditionBranch = {
      id: "if", type: "if",
      conditions: [
        { source: s1, operator: StringConditionOperator.Equals, value: "x" },
        { source: s2, operator: StringConditionOperator.Equals, value: "y" },
      ],
      logicalOperator: "OR",
    };
    expect(checkConditionBranch(b, getOutput)).toBe(false);
  });

  it("empty conditions array with AND returns true (vacuous truth)", () => {
    const b: ConditionBranch = { id: "else", type: "else", conditions: [], logicalOperator: "AND" };
    expect(checkConditionBranch(b, getOutput)).toBe(true);
  });
});
