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
