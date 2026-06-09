import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./auth-instance", () => ({
  getSession: vi.fn(),
}));

vi.mock("lib/user/utils", () => ({
  getIsUserAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));

const { getSession } = await import("./auth-instance");
const { getIsUserAdmin } = await import("lib/user/utils");

type MockSession = Awaited<ReturnType<typeof getSession>>;

const mockSessionFor = (user: Record<string, unknown>): MockSession =>
  ({ user, session: {} }) as unknown as MockSession;

describe("auth/permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hasAdminPermission returns true when user is admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "admin" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(true);

    await expect(permissions.hasAdminPermission()).resolves.toBe(true);
  });

  it("hasAdminPermission returns false when no session", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(permissions.hasAdminPermission()).resolves.toBe(false);
  });

  it("canManageUsers equals hasAdminPermission", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(permissions.canManageUsers()).resolves.toBe(false);

    vi.mocked(getIsUserAdmin).mockReturnValue(true);
    await expect(permissions.canManageUsers()).resolves.toBe(true);
  });

  it("canManageUser returns true for self regardless of admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "self", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(permissions.canManageUser("self")).resolves.toBe(true);
  });

  it("canManageUser returns true for others if admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "admin" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(true);

    await expect(permissions.canManageUser("other")).resolves.toBe(true);
  });

  it("requireAdminPermission throws when not admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(
      permissions.requireAdminPermission("do admin thing"),
    ).rejects.toThrow(/Admin access required/);
  });

  it("requireUserManagePermissionFor throws when cannot manage target", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);

    await expect(
      permissions.requireUserManagePermissionFor("u2", "manage this user"),
    ).rejects.toThrow(/Permission required/);
  });
});

describe("auth/permissions — return type invariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("hasAdminPermission always resolves to a boolean", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await permissions.hasAdminPermission();
    expect(typeof result).toBe("boolean");
  });

  it("canManageUsers always resolves to a boolean", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await permissions.canManageUsers();
    expect(typeof result).toBe("boolean");
  });

  it("canManageUser always resolves to a boolean", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await permissions.canManageUser("target");
    expect(typeof result).toBe("boolean");
  });
});

describe("auth/permissions — guard invariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requireAdminPermission resolves without throwing when admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "admin" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(true);
    await expect(permissions.requireAdminPermission("act")).resolves.not.toThrow();
  });

  it("requireUserManagePermissionFor resolves when user manages self", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "self", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);
    await expect(permissions.requireUserManagePermissionFor("self", "self-action")).resolves.not.toThrow();
  });

  it("canManageUser returns false when no session", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(null);
    expect(await permissions.canManageUser("target")).toBe(false);
  });

  it("hasAdminPermission returns false when user is non-admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);
    await expect(permissions.hasAdminPermission()).resolves.toBe(false);
  });

  it("requireAdminPermission error message includes the action description", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);
    await expect(permissions.requireAdminPermission("delete everything")).rejects.toThrow(
      /delete everything/,
    );
  });

  it("canManageUser returns false for different user when not admin", async () => {
    const permissions = await import("./permissions");
    vi.mocked(getSession).mockResolvedValue(mockSessionFor({ id: "u1", role: "user" }));
    vi.mocked(getIsUserAdmin).mockReturnValue(false);
    expect(await permissions.canManageUser("u2")).toBe(false);
  });
});
