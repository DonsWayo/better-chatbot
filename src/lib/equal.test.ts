import { describe, expect, it } from "vitest";
import equal from "./equal";

describe("equal — primitives", () => {
  it("identical numbers are equal", () => {
    expect(equal(1, 1)).toBe(true);
  });

  it("different numbers are not equal", () => {
    expect(equal(1, 2)).toBe(false);
  });

  it("identical strings are equal", () => {
    expect(equal("abc", "abc")).toBe(true);
  });

  it("different strings are not equal", () => {
    expect(equal("abc", "def")).toBe(false);
  });

  it("null equals null", () => {
    expect(equal(null, null)).toBe(true);
  });

  it("undefined equals undefined", () => {
    expect(equal(undefined, undefined)).toBe(true);
  });

  it("null and undefined are not equal", () => {
    expect(equal(null, undefined)).toBe(false);
  });

  it("true equals true", () => {
    expect(equal(true, true)).toBe(true);
  });

  it("false equals false", () => {
    expect(equal(false, false)).toBe(true);
  });

  it("true and false are not equal", () => {
    expect(equal(true, false)).toBe(false);
  });

  it("NaN equals NaN", () => {
    expect(equal(NaN, NaN)).toBe(true);
  });

  it("zero and negative zero are equal (SameValueZero)", () => {
    expect(equal(0, -0)).toBe(true);
  });
});

describe("equal — arrays", () => {
  it("empty arrays are equal", () => {
    expect(equal([], [])).toBe(true);
  });

  it("arrays with same elements are equal", () => {
    expect(equal([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("arrays with different elements are not equal", () => {
    expect(equal([1, 2], [1, 3])).toBe(false);
  });

  it("arrays of different lengths are not equal", () => {
    expect(equal([1, 2], [1, 2, 3])).toBe(false);
  });

  it("nested arrays are compared deeply", () => {
    expect(equal([[1, 2], [3]], [[1, 2], [3]])).toBe(true);
    expect(equal([[1, 2], [3]], [[1, 2], [4]])).toBe(false);
  });

  it("array and non-array are not equal", () => {
    expect(equal([1], { 0: 1 })).toBe(false);
  });
});

describe("equal — objects", () => {
  it("empty objects are equal", () => {
    expect(equal({}, {})).toBe(true);
  });

  it("objects with same keys and values are equal", () => {
    expect(equal({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("objects with different values are not equal", () => {
    expect(equal({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("objects with different keys are not equal", () => {
    expect(equal({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("objects with different key counts are not equal", () => {
    expect(equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("nested objects are compared deeply", () => {
    expect(equal({ x: { y: 1 } }, { x: { y: 1 } })).toBe(true);
    expect(equal({ x: { y: 1 } }, { x: { y: 2 } })).toBe(false);
  });
});

describe("equal — Date", () => {
  it("same date is equal", () => {
    const d1 = new Date(2024, 0, 1);
    const d2 = new Date(2024, 0, 1);
    expect(equal(d1, d2)).toBe(true);
  });

  it("different dates are not equal", () => {
    const d1 = new Date(2024, 0, 1);
    const d2 = new Date(2024, 0, 2);
    expect(equal(d1, d2)).toBe(false);
  });

  it("date and non-date are not equal", () => {
    expect(equal(new Date(0), 0)).toBe(false);
  });
});

describe("equal — RegExp", () => {
  it("same regexp is equal", () => {
    expect(equal(/abc/gi, /abc/gi)).toBe(true);
  });

  it("different patterns are not equal", () => {
    expect(equal(/abc/, /def/)).toBe(false);
  });

  it("different flags are not equal", () => {
    expect(equal(/abc/g, /abc/i)).toBe(false);
  });
});

describe("equal — Map", () => {
  it("empty Maps are equal", () => {
    expect(equal(new Map(), new Map())).toBe(true);
  });

  it("Maps with same entries are equal", () => {
    const a = new Map([["x", 1]]);
    const b = new Map([["x", 1]]);
    expect(equal(a, b)).toBe(true);
  });

  it("Maps with different values are not equal", () => {
    const a = new Map([["x", 1]]);
    const b = new Map([["x", 2]]);
    expect(equal(a, b)).toBe(false);
  });

  it("Maps with different sizes are not equal", () => {
    const a = new Map([["x", 1]]);
    const b = new Map([["x", 1], ["y", 2]]);
    expect(equal(a, b)).toBe(false);
  });
});

describe("equal — Set", () => {
  it("empty Sets are equal", () => {
    expect(equal(new Set(), new Set())).toBe(true);
  });

  it("Sets with same values are equal", () => {
    expect(equal(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(true);
  });

  it("Sets with different values are not equal", () => {
    expect(equal(new Set([1, 2]), new Set([1, 3]))).toBe(false);
  });

  it("Sets with different sizes are not equal", () => {
    expect(equal(new Set([1]), new Set([1, 2]))).toBe(false);
  });
});

describe("equal — return type invariants", () => {
  it("always returns a boolean", () => {
    const pairs: [unknown, unknown][] = [[1, 1], [null, undefined], [{}, []], [NaN, NaN]];
    for (const [a, b] of pairs) {
      expect(typeof equal(a, b)).toBe("boolean");
    }
  });
});
