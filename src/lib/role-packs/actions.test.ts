import { beforeEach, describe, expect, it, vi } from "vitest";

// Permission-gate tests for installRolePackAction (the Server Action under
// src/app/(chat)/(admin)/admin/role-packs/actions.ts). The gate must run
// before any install work, and the owner must come from the session — never
// from the caller.

const h = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  getSession: vi.fn(),
  installRolePack: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("auth/permissions", () => ({
  requireAdminPermission: h.requireAdminPermission,
}));

vi.mock("auth/server", () => ({
  getSession: h.getSession,
}));

vi.mock("lib/role-packs/install", () => ({
  installRolePack: h.installRolePack,
}));

vi.mock("next/cache", () => ({
  revalidatePath: h.revalidatePath,
}));

import { installRolePackAction } from "../../app/(chat)/(admin)/admin/role-packs/actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdminPermission.mockResolvedValue(undefined);
  h.getSession.mockResolvedValue({ user: { id: "admin-1" } });
  h.installRolePack.mockResolvedValue({
    created: ["agent:Proposal Drafter"],
    skipped: [],
  });
});

describe("installRolePackAction", () => {
  it("rejects non-admins before doing any work", async () => {
    h.requireAdminPermission.mockRejectedValue(
      new Error("Unauthorized: Admin access required to install role packs"),
    );

    await expect(installRolePackAction("sales")).rejects.toThrow(
      "Unauthorized",
    );
    expect(h.installRolePack).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when there is no session user", async () => {
    h.getSession.mockResolvedValue(null);

    await expect(installRolePackAction("sales")).rejects.toThrow(
      "Unauthorized",
    );
    expect(h.installRolePack).not.toHaveBeenCalled();
  });

  it("installs as the session user and revalidates the page", async () => {
    const result = await installRolePackAction("sales");

    expect(h.requireAdminPermission).toHaveBeenCalled();
    expect(h.installRolePack).toHaveBeenCalledWith("sales", "admin-1");
    expect(h.revalidatePath).toHaveBeenCalledWith("/admin/role-packs");
    expect(result).toEqual({
      created: ["agent:Proposal Drafter"],
      skipped: [],
    });
  });
});
