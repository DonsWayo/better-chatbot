import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks
vi.mock("./auth-instance", () => ({
  getSession: vi.fn(),
}));

vi.mock("lib/user/utils", () => ({
  getIsUserAdmin: vi.fn(),
}));

// server-only is used inside the module; stub it for tests
vi.mock("server-only", () => ({}));

const { getSession } = await import("./auth-instance");
const { getIsUserAdmin } = await import("lib/user/utils");

describe("auth/permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hasAdminPermission returns true when user is admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "admin" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(true);

    await expect(permissions.hasAdminPermission()).resolves.toBe(true);
  });

  it("hasAdminPermission returns false when no session", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null as any);

    await expect(permissions.hasAdminPermission()).resolves.toBe(false);
  });

  it("canManageUsers equals hasAdminPermission", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "user" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(permissions.canManageUsers()).resolves.toBe(false);

    vi.mocked(getIsUserAdmin).mockReturnValue(true);
    await expect(permissions.canManageUsers()).resolves.toBe(true);
  });

  it("canManageUser returns true for self regardless of admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "self", role: "user" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(permissions.canManageUser("self")).resolves.toBe(true);
  });

  it("canManageUser returns true for others if admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "admin" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(true);

    await expect(permissions.canManageUser("other")).resolves.toBe(true);
  });

  it("requireAdminPermission throws when not admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "user" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(
      permissions.requireAdminPermission("do admin thing"),
    ).rejects.toThrow(/Admin access required/);
  });

  it("requireUserManagePermissionFor throws when cannot manage target", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "user" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(
      permissions.requireUserManagePermissionFor("u2", "manage this user"),
    ).rejects.toThrow(/Permission required/);
  });

  it("canManageUser returns false when not admin and different user", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "user" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(permissions.canManageUser("u2")).resolves.toBe(false);
  });

  it("requireAdminPermission resolves when admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "admin" },
    } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(true);

    await expect(permissions.requireAdminPermission("do it")).resolves.toBeUndefined();
  });

  it("hasEditorPermission returns true for editor role", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "editor" },
    } as any);

    await expect(permissions.hasEditorPermission()).resolves.toBe(true);
  });

  it("hasEditorPermission returns false for user role", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "user" },
    } as any);

    await expect(permissions.hasEditorPermission()).resolves.toBe(false);
  });

  it("hasEditorPermission returns true for admin role", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1", role: "admin" },
    } as any);

    await expect(permissions.hasEditorPermission()).resolves.toBe(true);
  });
});

describe("auth/permissions — edge cases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hasAdminPermission returns false when user role is 'user'", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", role: "user" } } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);
    await expect(permissions.hasAdminPermission()).resolves.toBe(false);
  });

  it("requireAdminPermission throws when session is null", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null as any);
    await expect(permissions.requireAdminPermission("action")).rejects.toThrow();
  });

  it("hasEditorPermission returns false when session is null", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null as any);
    await expect(permissions.hasEditorPermission()).resolves.toBe(false);
  });

  it("requireUserManagePermissionFor resolves when managing self", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", role: "user" } } as any);
    vi.mocked(getIsUserAdmin).mockReturnValue(false);
    await expect(permissions.requireUserManagePermissionFor("u1", "self manage")).resolves.toBeUndefined();
  });
});
