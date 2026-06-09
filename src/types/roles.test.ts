import { describe, it, expect, vi } from "vitest";

describe("USER_ROLES constants", () => {
  it("has ADMIN role", async () => {
    const { USER_ROLES } = await import("./roles");
    expect(USER_ROLES.ADMIN).toBe("admin");
  });

  it("has EDITOR role", async () => {
    const { USER_ROLES } = await import("./roles");
    expect(USER_ROLES.EDITOR).toBe("editor");
  });

  it("has USER role", async () => {
    const { USER_ROLES } = await import("./roles");
    expect(USER_ROLES.USER).toBe("user");
  });

  it("has exactly three roles", async () => {
    const { USER_ROLES } = await import("./roles");
    expect(Object.keys(USER_ROLES)).toHaveLength(3);
  });
});

describe("userRolesInfo", () => {
  it("has label and description for each role", async () => {
    const { userRolesInfo, USER_ROLES } = await import("./roles");
    for (const role of Object.values(USER_ROLES)) {
      expect(userRolesInfo[role].label).toBeDefined();
      expect(userRolesInfo[role].description).toBeDefined();
      expect(userRolesInfo[role].label.length).toBeGreaterThan(0);
    }
  });

  it("admin has label Admin", async () => {
    const { userRolesInfo } = await import("./roles");
    expect(userRolesInfo.admin.label).toBe("Admin");
  });

  it("editor has label Editor", async () => {
    const { userRolesInfo } = await import("./roles");
    expect(userRolesInfo.editor.label).toBe("Editor");
  });
});

describe("DEFAULT_USER_ROLE", () => {
  it("defaults to editor when DEFAULT_USER_ROLE env is not set", async () => {
    delete process.env.DEFAULT_USER_ROLE;
    const { DEFAULT_USER_ROLE } = await import("./roles");
    expect(DEFAULT_USER_ROLE).toBe("editor");
  });

  it("uses env value when it is a valid role", async () => {
    vi.stubEnv("DEFAULT_USER_ROLE", "user");
    // Re-import to pick up the new env value
    vi.resetModules();
    const { DEFAULT_USER_ROLE } = await import("./roles");
    expect(DEFAULT_USER_ROLE).toBe("user");
    vi.unstubAllEnvs();
  });

  it("falls back to editor for invalid env value", async () => {
    vi.stubEnv("DEFAULT_USER_ROLE", "superuser");
    vi.resetModules();
    const { DEFAULT_USER_ROLE } = await import("./roles");
    expect(DEFAULT_USER_ROLE).toBe("editor");
    vi.unstubAllEnvs();
  });
});
