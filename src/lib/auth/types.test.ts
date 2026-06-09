import { describe, it, expect, vi } from "vitest";
import { parseRoleString, isBetterAuthRole } from "./types";

vi.mock("app-types/permissions", () => ({
  PERMISSION_TYPES: {
    CREATE: "create",
    VIEW: "view",
    UPDATE: "update",
    DELETE: "delete",
    USE: "use",
    LIST: "list",
  },
}));

describe("parseRoleString", () => {
  describe("valid roles", () => {
    it("returns 'admin' for 'admin'", () => {
      expect(parseRoleString("admin")).toBe("admin");
    });

    it("returns 'editor' for 'editor'", () => {
      expect(parseRoleString("editor")).toBe("editor");
    });

    it("returns 'user' for 'user'", () => {
      expect(parseRoleString("user")).toBe("user");
    });
  });

  describe("case normalization", () => {
    it("normalizes 'ADMIN' to 'admin'", () => {
      expect(parseRoleString("ADMIN")).toBe("admin");
    });

    it("normalizes 'Editor' to 'editor'", () => {
      expect(parseRoleString("Editor")).toBe("editor");
    });

    it("normalizes 'USER' to 'user'", () => {
      expect(parseRoleString("USER")).toBe("user");
    });
  });

  describe("OAuth prefixed roles", () => {
    it("strips 'google:' prefix and returns role", () => {
      expect(parseRoleString("google:editor")).toBe("editor");
    });

    it("strips 'github:' prefix and returns role", () => {
      expect(parseRoleString("github:admin")).toBe("admin");
    });

    it("strips 'provider:sub:' prefix and returns last segment", () => {
      expect(parseRoleString("provider:sub:user")).toBe("user");
    });

    it("handles mixed-case after prefix", () => {
      expect(parseRoleString("google:ADMIN")).toBe("admin");
    });
  });

  describe("invalid / missing roles", () => {
    it("defaults to 'user' for undefined", () => {
      expect(parseRoleString(undefined)).toBe("user");
    });

    it("defaults to 'user' for null", () => {
      expect(parseRoleString(null)).toBe("user");
    });

    it("defaults to 'user' for empty string", () => {
      expect(parseRoleString("")).toBe("user");
    });

    it("defaults to 'user' for unknown role string", () => {
      expect(parseRoleString("superuser")).toBe("user");
    });

    it("defaults to 'user' for whitespace-only string", () => {
      expect(parseRoleString("   ")).toBe("user");
    });

    it("defaults to 'user' for unknown role after prefix", () => {
      expect(parseRoleString("google:superadmin")).toBe("user");
    });
  });

  describe("whitespace handling", () => {
    it("trims leading/trailing spaces from clean role", () => {
      expect(parseRoleString("  admin  ")).toBe("admin");
    });

    it("trims spaces from role after prefix", () => {
      expect(parseRoleString("google: editor ")).toBe("editor");
    });
  });
});

describe("isBetterAuthRole", () => {
  it("returns true for object with statements property", () => {
    const role = { statements: { user: [], workflow: [] } };
    expect(isBetterAuthRole(role)).toBe(true);
  });

  it("returns true for object with empty statements object", () => {
    expect(isBetterAuthRole({ statements: {} })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isBetterAuthRole(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isBetterAuthRole(undefined)).toBe(false);
  });

  it("returns false for plain string", () => {
    expect(isBetterAuthRole("admin")).toBe(false);
  });

  it("returns false for number", () => {
    expect(isBetterAuthRole(42)).toBe(false);
  });

  it("returns false for object without statements", () => {
    expect(isBetterAuthRole({ role: "admin" })).toBe(false);
  });

  it("returns false for object with non-object statements", () => {
    expect(isBetterAuthRole({ statements: "admin" })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isBetterAuthRole({})).toBe(false);
  });

  it("returns true for array-like object with statements", () => {
    expect(isBetterAuthRole({ statements: { user: ["create"] } })).toBe(true);
  });
});
