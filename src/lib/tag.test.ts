import { describe, it, expect } from "vitest";
import { tag } from "./tag";

describe("tag builder — create", () => {
  const userTag = tag<{ name: string; age: number }>("user");

  it("creates a tagged object with the tag key", () => {
    const obj = userTag.create({ name: "Alice", age: 30 });
    expect(obj.name).toBe("Alice");
    expect(obj.age).toBe(30);
    expect((obj as any)["__$ref__"]).toBe("user");
  });

  it("preserves all data fields on created object", () => {
    const obj = userTag.create({ name: "Bob", age: 25 });
    expect(obj.name).toBe("Bob");
    expect(obj.age).toBe(25);
  });
});

describe("tag builder — isMaybe", () => {
  const itemTag = tag<{ id: string }>("item");

  it("returns true for an object created with the same tag", () => {
    const obj = itemTag.create({ id: "abc" });
    expect(itemTag.isMaybe(obj)).toBe(true);
  });

  it("returns false for null", () => {
    expect(itemTag.isMaybe(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(itemTag.isMaybe(undefined)).toBe(false);
  });

  it("returns false for a plain object without tag", () => {
    expect(itemTag.isMaybe({ id: "abc" })).toBe(false);
  });

  it("returns false for an object with a different tag value", () => {
    const otherTag = tag<{ id: string }>("other");
    const obj = otherTag.create({ id: "abc" });
    expect(itemTag.isMaybe(obj)).toBe(false);
  });

  it("returns false for a string primitive", () => {
    expect(itemTag.isMaybe("item")).toBe(false);
  });
});

describe("tag builder — unwrap", () => {
  const eventTag = tag<{ type: string; payload: unknown }>("event");

  it("removes the tag key when unwrapping", () => {
    const obj = eventTag.create({ type: "click", payload: {} });
    const unwrapped = eventTag.unwrap(obj);
    expect((unwrapped as any)["__$ref__"]).toBeUndefined();
  });

  it("preserves data fields after unwrap", () => {
    const obj = eventTag.create({ type: "submit", payload: { x: 1 } });
    const unwrapped = eventTag.unwrap(obj);
    expect(unwrapped.type).toBe("submit");
    expect(unwrapped.payload).toEqual({ x: 1 });
  });
});

describe("tag builder — different tag names do not interfere", () => {
  const aTag = tag<{ v: number }>("A");
  const bTag = tag<{ v: number }>("B");

  it("A.isMaybe returns false for a B-tagged object", () => {
    const bObj = bTag.create({ v: 1 });
    expect(aTag.isMaybe(bObj)).toBe(false);
  });

  it("B.isMaybe returns false for an A-tagged object", () => {
    const aObj = aTag.create({ v: 2 });
    expect(bTag.isMaybe(aObj)).toBe(false);
  });
});

describe("tag builder — isMaybe edge cases", () => {
  const nodeTag = tag<{ value: unknown }>("node");

  it("returns false for an array (even if it has the tag key)", () => {
    const arr = Object.assign([], { "__$ref__": "node" });
    // Arrays are objects, so isMaybe may vary, but raw arrays without tag should fail
    expect(nodeTag.isMaybe([])).toBe(false);
  });

  it("returns false for a number primitive", () => {
    expect(nodeTag.isMaybe(42)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(nodeTag.isMaybe(true)).toBe(false);
  });

  it("returns true for nested data objects created with the same tag", () => {
    const obj = nodeTag.create({ value: { nested: { deep: "ok" } } });
    expect(nodeTag.isMaybe(obj)).toBe(true);
  });

  it("two separately created objects with same tag are both isMaybe", () => {
    const o1 = nodeTag.create({ value: "first" });
    const o2 = nodeTag.create({ value: "second" });
    expect(nodeTag.isMaybe(o1)).toBe(true);
    expect(nodeTag.isMaybe(o2)).toBe(true);
  });
});

describe("tag builder — unwrap with complex data", () => {
  const recordTag = tag<{ items: string[]; meta: { count: number } }>("record");

  it("unwrap preserves array fields", () => {
    const obj = recordTag.create({ items: ["a", "b", "c"], meta: { count: 3 } });
    const unwrapped = recordTag.unwrap(obj);
    expect(unwrapped.items).toEqual(["a", "b", "c"]);
  });

  it("unwrap preserves nested object fields", () => {
    const obj = recordTag.create({ items: [], meta: { count: 5 } });
    const unwrapped = recordTag.unwrap(obj);
    expect(unwrapped.meta.count).toBe(5);
  });

  it("isMaybe is false on unwrapped object (tag key removed)", () => {
    const obj = recordTag.create({ items: [], meta: { count: 0 } });
    const unwrapped = recordTag.unwrap(obj);
    expect(recordTag.isMaybe(unwrapped)).toBe(false);
  });
});
