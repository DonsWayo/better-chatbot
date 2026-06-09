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
});
