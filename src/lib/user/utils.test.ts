import { describe, it, expect, beforeEach } from "vitest";
import { USER_ROLES } from "app-types/roles";
import { getUserAvatar, getIsUserAdmin } from "./utils";

describe("User Utils", () => {
  beforeEach(() => {
    delete process.env.DISABLE_DEFAULT_AVATAR;
  });

  describe("getUserAvatar - Avatar Selection Logic", () => {
    it("should prioritize user image over default", () => {
      const result = getUserAvatar({ image: "https://example.com/avatar.jpg" });
      expect(result).toBe("https://example.com/avatar.jpg");
    });

    it("should fall back to default avatar when no user image", () => {
      expect(getUserAvatar({ image: null })).toBe("/pf.png");
      expect(getUserAvatar({})).toBe("/pf.png");
      expect(getUserAvatar({ image: "" })).toBe("/pf.png");
    });

    it("should respect DISABLE_DEFAULT_AVATAR environment flag", () => {
      process.env.DISABLE_DEFAULT_AVATAR = "true";

      expect(getUserAvatar({ image: null })).toBe("");
      expect(getUserAvatar({})).toBe("");

      // But still return user image when available
      expect(getUserAvatar({ image: "custom.jpg" })).toBe("custom.jpg");
    });

    it("only 'true' (exact) disables default avatar — other truthy values do not", () => {
      process.env.DISABLE_DEFAULT_AVATAR = "1";
      expect(getUserAvatar({ image: null })).toBe("/pf.png");

      process.env.DISABLE_DEFAULT_AVATAR = "TRUE";
      expect(getUserAvatar({ image: null })).toBe("/pf.png");

      process.env.DISABLE_DEFAULT_AVATAR = "yes";
      expect(getUserAvatar({ image: null })).toBe("/pf.png");
    });
  });

  describe("getIsUserAdmin - Role Parsing Logic", () => {
    it("should detect admin role in single role", () => {
      expect(getIsUserAdmin({ role: USER_ROLES.ADMIN })).toBe(true);
      expect(getIsUserAdmin({ role: USER_ROLES.USER })).toBe(false);
      expect(getIsUserAdmin({ role: USER_ROLES.EDITOR })).toBe(false);
    });

    it("should detect admin role in comma-separated roles", () => {
      expect(
        getIsUserAdmin({ role: `${USER_ROLES.USER},${USER_ROLES.ADMIN}` }),
      ).toBe(true);
      expect(
        getIsUserAdmin({ role: `${USER_ROLES.ADMIN},${USER_ROLES.EDITOR}` }),
      ).toBe(true);
      expect(
        getIsUserAdmin({ role: `${USER_ROLES.USER},${USER_ROLES.EDITOR}` }),
      ).toBe(false);
    });

    it("should handle edge cases gracefully", () => {
      expect(getIsUserAdmin({ role: null })).toBe(false);
      expect(getIsUserAdmin({})).toBe(false);
      expect(getIsUserAdmin({ role: "" })).toBe(false);
    });

    it("should require exact string match (case sensitive)", () => {
      expect(getIsUserAdmin({ role: "ADMIN" })).toBe(false); // wrong case
      expect(getIsUserAdmin({ role: " admin " })).toBe(false); // whitespace
    });
    it("should handle undefined user", () => {
      expect(getIsUserAdmin(undefined)).toBe(false);
    });

    it("admin as substring of another word is not matched", () => {
      expect(getIsUserAdmin({ role: "administrator" })).toBe(false);
      expect(getIsUserAdmin({ role: "super_admin" })).toBe(false);
    });

    it("admin first in comma-separated list is detected", () => {
      expect(getIsUserAdmin({ role: `${USER_ROLES.ADMIN},${USER_ROLES.USER}` })).toBe(true);
    });

    it("admin last in comma-separated list is detected", () => {
      expect(getIsUserAdmin({ role: `${USER_ROLES.USER},${USER_ROLES.ADMIN}` })).toBe(true);
    });
  });
});

describe("getUserAvatar — additional", () => {
  beforeEach(() => { delete process.env.DISABLE_DEFAULT_AVATAR; });

  it("returns string type in all code paths", () => {
    expect(typeof getUserAvatar({ image: "http://example.com/img.jpg" })).toBe("string");
    expect(typeof getUserAvatar({ image: null })).toBe("string");
    expect(typeof getUserAvatar({})).toBe("string");
  });

  it("whitespace-only image is truthy and returned as-is", () => {
    expect(getUserAvatar({ image: " " })).toBe(" ");
  });
});

describe("getIsUserAdmin — additional", () => {
  it("returns boolean type, not just truthy/falsy value", () => {
    expect(typeof getIsUserAdmin({ role: USER_ROLES.ADMIN })).toBe("boolean");
    expect(typeof getIsUserAdmin({ role: USER_ROLES.USER })).toBe("boolean");
    expect(typeof getIsUserAdmin(undefined)).toBe("boolean");
  });

  it("space before admin in comma-separated string is not matched", () => {
    expect(getIsUserAdmin({ role: "user, admin" })).toBe(false);
  });

  it("trailing comma after admin still matches", () => {
    expect(getIsUserAdmin({ role: `${USER_ROLES.ADMIN},` })).toBe(true);
  });
});

describe("getUserAvatar — return type invariants", () => {
  it("always returns a string", () => {
    expect(typeof getUserAvatar({})).toBe("string");
    expect(typeof getUserAvatar({ image: "x.jpg" })).toBe("string");
    expect(typeof getUserAvatar({ image: null })).toBe("string");
  });

  it("returns a non-null value", () => {
    expect(getUserAvatar({})).not.toBeNull();
    expect(getUserAvatar({ image: null })).not.toBeNull();
  });
});

describe("getIsUserAdmin — return type invariants", () => {
  it("always returns a boolean", () => {
    const inputs: Array<{ role?: string | null } | undefined> = [
      undefined,
      {},
      { role: "admin" },
      { role: "user" },
      { role: null },
    ];
    for (const input of inputs) {
      expect(typeof getIsUserAdmin(input)).toBe("boolean");
    }
  });
});

describe("getIsUserAdmin — additional edge cases", () => {
  it("returns false for role = 'Admin' (capital A)", () => {
    expect(getIsUserAdmin({ role: "Admin" })).toBe(false);
  });

  it("returns false for role = 'ADMIN' (all caps)", () => {
    expect(getIsUserAdmin({ role: "ADMIN" })).toBe(false);
  });

  it("returns true for admin role mixed with other valid roles", () => {
    expect(getIsUserAdmin({ role: "editor,admin" })).toBe(true);
  });

  it("returns false for empty role string", () => {
    expect(getIsUserAdmin({ role: "" })).toBe(false);
  });

  it("returns false for purely whitespace role", () => {
    expect(getIsUserAdmin({ role: "   " })).toBe(false);
  });
});
