import { describe, it, expect } from "vitest";
import { tag, type Tagged } from "./tag";

type Payload = { value: number; label: string };
const myTag = tag<Payload>("myTag");

describe("tag — create", () => {
  it("returns an object with all original properties", () => {
    const tagged = myTag.create({ value: 42, label: "hello" });
    expect(tagged.value).toBe(42);
    expect(tagged.label).toBe("hello");
  });

  it("stamped object passes isMaybe", () => {
    const tagged = myTag.create({ value: 1, label: "x" });
    expect(myTag.isMaybe(tagged)).toBe(true);
  });

  it("plain object without stamp does not pass isMaybe", () => {
    const plain = { value: 1, label: "x" };
    expect(myTag.isMaybe(plain)).toBe(false);
  });
});

describe("tag — isMaybe", () => {
  it("returns false for null", () => {
    expect(myTag.isMaybe(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(myTag.isMaybe(undefined)).toBe(false);
  });

  it("returns false for a number", () => {
    expect(myTag.isMaybe(42)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(myTag.isMaybe("hello")).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(myTag.isMaybe({})).toBe(false);
  });

  it("returns false for object tagged with different tag name", () => {
    const otherTag = tag<Payload>("otherTag");
    const other = otherTag.create({ value: 1, label: "y" });
    expect(myTag.isMaybe(other)).toBe(false);
  });

  it("returns true for correctly tagged object", () => {
    const tagged = myTag.create({ value: 10, label: "z" });
    expect(myTag.isMaybe(tagged)).toBe(true);
  });
});

describe("tag — unwrap", () => {
  it("returns original data without the tag key", () => {
    const tagged = myTag.create({ value: 99, label: "unwrap-me" });
    const unwrapped = myTag.unwrap(tagged);
    expect(unwrapped.value).toBe(99);
    expect(unwrapped.label).toBe("unwrap-me");
    expect("__$ref__" in unwrapped).toBe(false);
  });

  it("unwrap then create produces equivalent structure", () => {
    const original = { value: 7, label: "round-trip" };
    const tagged = myTag.create(original);
    const unwrapped = myTag.unwrap(tagged);
    expect(unwrapped).toEqual(original);
  });
});

describe("tag — multiple independent tags", () => {
  type TypeA = { id: string };
  type TypeB = { count: number };

  const tagA = tag<TypeA>("typeA");
  const tagB = tag<TypeB>("typeB");

  it("tagA.isMaybe rejects tagB values", () => {
    const b = tagB.create({ count: 5 });
    expect(tagA.isMaybe(b)).toBe(false);
  });

  it("tagB.isMaybe rejects tagA values", () => {
    const a = tagA.create({ id: "abc" });
    expect(tagB.isMaybe(a)).toBe(false);
  });

  it("each tag recognises only its own values", () => {
    const a = tagA.create({ id: "x" });
    const b = tagB.create({ count: 3 });
    expect(tagA.isMaybe(a)).toBe(true);
    expect(tagB.isMaybe(b)).toBe(true);
    expect(tagA.isMaybe(b)).toBe(false);
    expect(tagB.isMaybe(a)).toBe(false);
  });
});

describe("tag — frozen builder", () => {
  it("tag() returns a frozen object (immutable)", () => {
    const t = tag<{ x: number }>("frozen-test");
    expect(Object.isFrozen(t)).toBe(true);
  });
});
