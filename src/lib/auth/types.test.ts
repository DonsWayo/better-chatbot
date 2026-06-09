import { describe, it, expect } from "vitest";
import { parseRoleString, isBetterAuthRole } from "./types";

describe("parseRoleString", () => {
  it("returns 'user' for null or undefined", () => {
    expect(parseRoleString(null)).toBe("user");
    expect(parseRoleString(undefined)).toBe("user");
  });

  it("returns 'user' for empty string", () => {
    expect(parseRoleString("")).toBe("user");
  });

  it("parses admin", () => {
    expect(parseRoleString("admin")).toBe("admin");
  });

  it("parses editor", () => {
    expect(parseRoleString("editor")).toBe("editor");
  });

  it("parses user", () => {
    expect(parseRoleString("user")).toBe("user");
  });

  it("handles OAuth-prefixed roles (e.g. google:editor)", () => {
    expect(parseRoleString("google:editor")).toBe("editor");
    expect(parseRoleString("github:admin")).toBe("admin");
  });

  it("handles multiple colons by using the part after last colon", () => {
    expect(parseRoleString("provider:org:admin")).toBe("admin");
  });

  it("normalises uppercase to lowercase", () => {
    expect(parseRoleString("ADMIN")).toBe("admin");
    expect(parseRoleString("EDITOR")).toBe("editor");
  });

  it("defaults to 'user' for unknown role names", () => {
    expect(parseRoleString("superuser")).toBe("user");
    expect(parseRoleString("god")).toBe("user");
  });
});

describe("isBetterAuthRole", () => {
  it("returns true for valid role object with statements", () => {
    expect(isBetterAuthRole({ statements: {} })).toBe(true);
    expect(isBetterAuthRole({ statements: { agent: ["create", "view"] } })).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isBetterAuthRole(null)).toBe(false);
    expect(isBetterAuthRole(undefined)).toBe(false);
  });

  it("returns false when statements is missing", () => {
    expect(isBetterAuthRole({ other: {} })).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isBetterAuthRole("admin")).toBe(false);
    expect(isBetterAuthRole(42)).toBe(false);
  });
});
