import { describe, expect, it } from "vitest";
import {
  USER_ROLES,
  DEFAULT_USER_ROLE,
  userRolesInfo,
  type UserRoleNames,
} from "./roles";

describe("USER_ROLES", () => {
  it("has ADMIN, EDITOR, USER keys", () => {
    expect(USER_ROLES).toHaveProperty("ADMIN");
    expect(USER_ROLES).toHaveProperty("EDITOR");
    expect(USER_ROLES).toHaveProperty("USER");
  });

  it("ADMIN value is 'admin'", () => {
    expect(USER_ROLES.ADMIN).toBe("admin");
  });

  it("EDITOR value is 'editor'", () => {
    expect(USER_ROLES.EDITOR).toBe("editor");
  });

  it("USER value is 'user'", () => {
    expect(USER_ROLES.USER).toBe("user");
  });

  it("has exactly 3 roles", () => {
    expect(Object.keys(USER_ROLES).length).toBe(3);
  });

  it("all values are non-empty strings", () => {
    for (const v of Object.values(USER_ROLES)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("all values are lowercase", () => {
    for (const v of Object.values(USER_ROLES)) {
      expect(v).toBe(v.toLowerCase());
    }
  });
});

describe("DEFAULT_USER_ROLE", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_USER_ROLE).toBe("string");
    expect(DEFAULT_USER_ROLE.length).toBeGreaterThan(0);
  });

  it("is one of the valid roles", () => {
    expect(Object.values(USER_ROLES)).toContain(DEFAULT_USER_ROLE);
  });
});

describe("userRolesInfo", () => {
  it("has an entry for every role", () => {
    for (const role of Object.values(USER_ROLES)) {
      expect(userRolesInfo).toHaveProperty(role);
    }
  });

  it("each role info has label and description", () => {
    for (const [, info] of Object.entries(userRolesInfo)) {
      expect(typeof info.label).toBe("string");
      expect(info.label.length).toBeGreaterThan(0);
      expect(typeof info.description).toBe("string");
      expect(info.description.length).toBeGreaterThan(0);
    }
  });

  it("labels are unique", () => {
    const labels = Object.values(userRolesInfo).map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("roles — type invariants", () => {
  it("USER_ROLES is an object", () => {
    expect(typeof USER_ROLES).toBe("object");
    expect(USER_ROLES).not.toBeNull();
  });

  it("userRolesInfo is an object", () => {
    expect(typeof userRolesInfo).toBe("object");
    expect(userRolesInfo).not.toBeNull();
  });

  it("role values match keys in userRolesInfo", () => {
    const infoKeys = Object.keys(userRolesInfo);
    for (const role of Object.values(USER_ROLES)) {
      expect(infoKeys).toContain(role);
    }
  });
});
