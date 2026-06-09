import { describe, it, expect } from "vitest";
import { tag } from "./tag";

interface User {
  id: string;
  name: string;
}

const UserTag = tag<User>("User");

describe("tag", () => {
  it("creates a tagged value", () => {
    const u = UserTag.create({ id: "u1", name: "Alice" });
    expect(u.id).toBe("u1");
    expect(u.name).toBe("Alice");
  });

  it("isMaybe returns true for tagged values", () => {
    const u = UserTag.create({ id: "u1", name: "Alice" });
    expect(UserTag.isMaybe(u)).toBe(true);
  });

  it("isMaybe returns false for untagged objects", () => {
    expect(UserTag.isMaybe({ id: "u1", name: "Alice" })).toBe(false);
    expect(UserTag.isMaybe(null)).toBe(false);
    expect(UserTag.isMaybe(undefined)).toBe(false);
    expect(UserTag.isMaybe(42)).toBe(false);
  });

  it("isMaybe returns false for differently-tagged value", () => {
    const OtherTag = tag<User>("Other");
    const u = OtherTag.create({ id: "u1", name: "Alice" });
    expect(UserTag.isMaybe(u)).toBe(false);
  });

  it("unwrap removes the tag and returns original data", () => {
    const u = UserTag.create({ id: "u1", name: "Alice" });
    const data = UserTag.unwrap(u);
    expect(data.id).toBe("u1");
    expect(data.name).toBe("Alice");
    expect(UserTag.isMaybe(data)).toBe(false);
  });

  it("different tag names produce isolated types", () => {
    const TagA = tag<{ x: number }>("A");
    const TagB = tag<{ x: number }>("B");
    const a = TagA.create({ x: 1 });
    expect(TagA.isMaybe(a)).toBe(true);
    expect(TagB.isMaybe(a)).toBe(false);
  });
});
