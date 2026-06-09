import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAdminPermissionMock, createTeamMock, revalidatePathMock } = vi.hoisted(() => ({
  requireAdminPermissionMock: vi.fn(),
  createTeamMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("lib/auth/permissions", () => ({ requireAdminPermission: requireAdminPermissionMock }));
vi.mock("lib/admin/teams", () => ({ createTeam: createTeamMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

describe("createTeamAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValue(new Error("Forbidden"));
    const { createTeamAction } = await import("./actions");
    await expect(createTeamAction("My Team")).rejects.toThrow(/Forbidden/i);
    expect(createTeamMock).not.toHaveBeenCalled();
  });

  it("creates team and revalidates path for admin", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    createTeamMock.mockResolvedValue(undefined);
    const { createTeamAction } = await import("./actions");
    await createTeamAction("Engineering", "Tech team");
    expect(createTeamMock).toHaveBeenCalledWith("Engineering", "Tech team");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams");
  });

  it("creates team without description", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    createTeamMock.mockResolvedValue(undefined);
    const { createTeamAction } = await import("./actions");
    await createTeamAction("Sales");
    expect(createTeamMock).toHaveBeenCalledWith("Sales", undefined);
  });

  it("revalidatePath is not called when requireAdminPermission throws", async () => {
    requireAdminPermissionMock.mockRejectedValue(new Error("Forbidden"));
    const { createTeamAction } = await import("./actions");
    await expect(createTeamAction("Ops")).rejects.toThrow();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidatePath is not called when createTeam throws", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    createTeamMock.mockRejectedValue(new Error("DB error"));
    const { createTeamAction } = await import("./actions");
    await expect(createTeamAction("Dev")).rejects.toThrow("DB error");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates exactly /admin/teams path", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    createTeamMock.mockResolvedValue(undefined);
    const { createTeamAction } = await import("./actions");
    await createTeamAction("Marketing");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams");
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
  });

  it("calls requireAdminPermission exactly once", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    createTeamMock.mockResolvedValue(undefined);
    const { createTeamAction } = await import("./actions");
    await createTeamAction("Finance");
    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
  });
});
