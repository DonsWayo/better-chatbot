import { describe, it, expect } from "vitest";
import equal from "./equal";

describe("equal", () => {
  it("returns true for identical primitives", () => {
    expect(equal(1, 1)).toBe(true);
    expect(equal("hello", "hello")).toBe(true);
    expect(equal(true, false)).toBe(false);
  });

  it("handles NaN equality", () => {
    expect(equal(NaN, NaN)).toBe(true);
    expect(equal(NaN, 1)).toBe(false);
  });

  it("compares flat objects", () => {
    expect(equal({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(equal({ a: 1 }, { a: 2 })).toBe(false);
    expect(equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compares nested objects", () => {
    expect(equal({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(equal({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it("compares arrays", () => {
    expect(equal([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(equal([1, 2], [1, 2, 3])).toBe(false);
    expect(equal([1, [2]], [1, [2]])).toBe(true);
  });

  it("compares Dates", () => {
    expect(equal(new Date("2024-01-01"), new Date("2024-01-01"))).toBe(true);
    expect(equal(new Date("2024-01-01"), new Date("2024-01-02"))).toBe(false);
  });

  it("compares Maps", () => {
    const m1 = new Map([["a", 1]]);
    const m2 = new Map([["a", 1]]);
    const m3 = new Map([["a", 2]]);
    expect(equal(m1, m2)).toBe(true);
    expect(equal(m1, m3)).toBe(false);
  });

  it("compares Sets", () => {
    expect(equal(new Set([1, 2]), new Set([1, 2]))).toBe(true);
    expect(equal(new Set([1, 2]), new Set([1, 3]))).toBe(false);
  });

  it("compares RegExps", () => {
    expect(equal(/abc/gi, /abc/gi)).toBe(true);
    expect(equal(/abc/, /xyz/)).toBe(false);
    expect(equal(/abc/g, /abc/i)).toBe(false);
  });

  it("handles null and undefined", () => {
    expect(equal(null, null)).toBe(true);
    expect(equal(undefined, undefined)).toBe(true);
    expect(equal(null, undefined)).toBe(false);
  });

  it("returns false for different types", () => {
    expect(equal([], {})).toBe(false);
    expect(equal(new Date(), {})).toBe(false);
  });
});
