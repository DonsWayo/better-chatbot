import { describe, it, expect } from "vitest";
import { parseRoleString, isBetterAuthRole } from "./types";

describe("parseRoleString", () => {
  it("returns 'user' for undefined", () => {
    expect(parseRoleString(undefined)).toBe("user");
  });

  it("returns 'user' for null", () => {
    expect(parseRoleString(null)).toBe("user");
  });

  it("returns 'user' for empty string", () => {
    expect(parseRoleString("")).toBe("user");
  });

  it("parses plain 'admin' role", () => {
    expect(parseRoleString("admin")).toBe("admin");
  });

  it("parses plain 'editor' role", () => {
    expect(parseRoleString("editor")).toBe("editor");
  });

  it("parses plain 'user' role", () => {
    expect(parseRoleString("user")).toBe("user");
  });

  it("handles uppercase role name (normalizes to lowercase)", () => {
    expect(parseRoleString("ADMIN")).toBe("admin");
  });

  it("strips OAuth provider prefix 'google:editor'", () => {
    expect(parseRoleString("google:editor")).toBe("editor");
  });

  it("strips OAuth provider prefix 'github:admin'", () => {
    expect(parseRoleString("github:admin")).toBe("admin");
  });

  it("handles multiple colons — takes segment after last colon", () => {
    expect(parseRoleString("oidc:provider:admin")).toBe("admin");
  });

  it("defaults to 'user' for unknown role string", () => {
    expect(parseRoleString("superuser")).toBe("user");
  });

  it("defaults to 'user' for role after colon that is unknown", () => {
    expect(parseRoleString("google:superuser")).toBe("user");
  });

  it("trims whitespace around role", () => {
    expect(parseRoleString("  admin  ")).toBe("admin");
  });

  it("normalizes uppercase EDITOR to editor", () => {
    expect(parseRoleString("EDITOR")).toBe("editor");
  });

  it("normalizes uppercase USER to user", () => {
    expect(parseRoleString("USER")).toBe("user");
  });

  it("handles colon with no prefix (leading colon) → takes segment after last colon", () => {
    expect(parseRoleString(":admin")).toBe("admin");
  });

  it("handles mixed-case prefixed role (Google:Admin → admin)", () => {
    expect(parseRoleString("google:Admin")).toBe("admin");
  });
});

describe("isBetterAuthRole", () => {
  it("returns true for a valid role object", () => {
    expect(isBetterAuthRole({ statements: {} })).toBe(true);
  });

  it("returns true for object with populated statements", () => {
    expect(
      isBetterAuthRole({
        statements: { agent: ["create", "view"], workflow: ["use"] },
      }),
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(isBetterAuthRole(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isBetterAuthRole(undefined)).toBe(false);
  });

  it("returns false for a plain object without statements", () => {
    expect(isBetterAuthRole({ permissions: [] })).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isBetterAuthRole("admin")).toBe(false);
  });

  it("returns false when statements is not an object", () => {
    expect(isBetterAuthRole({ statements: "all" })).toBe(false);
  });

  it("returns false for an array (no statements property)", () => {
    expect(isBetterAuthRole([])).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isBetterAuthRole(42)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isBetterAuthRole(true)).toBe(false);
  });
});
