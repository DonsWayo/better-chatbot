import { beforeEach, describe, expect, it, vi } from "vitest";

// ── shared hoisted mocks ───────────────────────────────────────────────────────

const {
  requireAdminPermissionMock,
  getSessionMock,
  canManageTeamMock,
  revalidatePathMock,
  redirectMock,
  updateTeamPolicyMock,
  addTeamMemberMock,
  removeTeamMemberMock,
  updateTeamMemberRoleMock,
  updateTeamMock,
  deleteTeamMock,
  dbSelectLimitMock,
  dbInsertOnConflictMock,
} = vi.hoisted(() => ({
  requireAdminPermissionMock: vi.fn().mockResolvedValue(undefined),
  getSessionMock: vi
    .fn()
    .mockResolvedValue({ user: { id: "actor-1", role: "user" } }),
  canManageTeamMock: vi.fn().mockResolvedValue(true),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
  updateTeamPolicyMock: vi.fn().mockResolvedValue(undefined),
  addTeamMemberMock: vi.fn().mockResolvedValue(undefined),
  removeTeamMemberMock: vi.fn().mockResolvedValue(undefined),
  updateTeamMemberRoleMock: vi.fn().mockResolvedValue(undefined),
  updateTeamMock: vi.fn().mockResolvedValue(undefined),
  deleteTeamMock: vi.fn().mockResolvedValue(undefined),
  dbSelectLimitMock: vi
    .fn()
    .mockResolvedValue([{ id: "u1", email: "alice@asafe.ai" }]),
  dbInsertOnConflictMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: requireAdminPermissionMock,
}));

vi.mock("lib/auth/server", () => ({
  getSession: getSessionMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("lib/admin/teams", () => ({
  addTeamMember: addTeamMemberMock,
  removeTeamMember: removeTeamMemberMock,
  updateTeamPolicy: updateTeamPolicyMock,
  updateTeamMemberRole: updateTeamMemberRoleMock,
  updateTeam: updateTeamMock,
  deleteTeam: deleteTeamMock,
  canManageTeam: canManageTeamMock,
}));

const dbSelectWhereMock = vi.fn().mockReturnValue({ limit: dbSelectLimitMock });
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
const dbSelectMock = vi.fn().mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: dbSelectMock,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: dbInsertOnConflictMock,
      }),
    }),
  },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  UserTable: { email: "email" },
  AsafeTeamBudgetTable: { teamId: "teamId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

function resetAll() {
  vi.clearAllMocks();
  requireAdminPermissionMock.mockResolvedValue(undefined);
  getSessionMock.mockResolvedValue({ user: { id: "actor-1", role: "user" } });
  canManageTeamMock.mockResolvedValue(true);
  dbSelectLimitMock.mockResolvedValue([{ id: "u1", email: "alice@asafe.ai" }]);
}

// ── global-admin-only actions ─────────────────────────────────────────────────

describe("setModelAllowListAction", () => {
  beforeEach(resetAll);

  it("requires GLOBAL admin, then calls updateTeamPolicy with modelAllowList", async () => {
    const { setModelAllowListAction } = await import("./actions");
    await setModelAllowListAction("team-1", ["gpt-5.5", "claude-opus-4.8"]);

    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-1", {
      modelAllowList: ["gpt-5.5", "claude-opus-4.8"],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-1");
  });

  it("accepts an empty array to clear restrictions", async () => {
    const { setModelAllowListAction } = await import("./actions");
    await setModelAllowListAction("team-2", []);

    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-2", {
      modelAllowList: [],
    });
  });

  it("returns a structured failure if requireAdminPermission rejects — TEAM admin is NOT enough", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    canManageTeamMock.mockResolvedValue(true); // team admin
    const { setModelAllowListAction } = await import("./actions");
    await expect(setModelAllowListAction("team-1", [])).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(updateTeamPolicyMock).not.toHaveBeenCalled();
  });
});

describe("setEmailDomainsAction", () => {
  beforeEach(resetAll);

  it("requires GLOBAL admin, then calls updateTeamPolicy with allowedEmailDomains", async () => {
    const { setEmailDomainsAction } = await import("./actions");
    await setEmailDomainsAction("team-3", ["asafe.ai", "corp.example.com"]);

    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-3", {
      allowedEmailDomains: ["asafe.ai", "corp.example.com"],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-3");
  });

  it("stays global-admin-only even when the caller can manage the team", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    canManageTeamMock.mockResolvedValue(true);
    const { setEmailDomainsAction } = await import("./actions");
    await expect(setEmailDomainsAction("team-4", [])).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(updateTeamPolicyMock).not.toHaveBeenCalled();
  });
});

describe("setPolicyAction", () => {
  beforeEach(resetAll);

  it("requires GLOBAL admin, then calls updateTeamPolicy with the full patch", async () => {
    const { setPolicyAction } = await import("./actions");
    await setPolicyAction("team-5", {
      guardrailPolicy: "strict",
      allowImageGen: true,
      allowVision: false,
      allowSpeech: true,
    });

    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-5", {
      guardrailPolicy: "strict",
      allowImageGen: true,
      allowVision: false,
      allowSpeech: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-5");
  });

  it("stays global-admin-only even for a team admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    canManageTeamMock.mockResolvedValue(true);
    const { setPolicyAction } = await import("./actions");
    await expect(
      setPolicyAction("team-6", { guardrailPolicy: "permissive" }),
    ).resolves.toEqual({ success: false, error: "Forbidden" });
    expect(updateTeamPolicyMock).not.toHaveBeenCalled();
  });

  it("surfaces errors from updateTeamPolicy as a structured failure", async () => {
    updateTeamPolicyMock.mockRejectedValueOnce(new Error("DB write failed"));
    const { setPolicyAction } = await import("./actions");
    await expect(
      setPolicyAction("team-7", { allowSpeech: true }),
    ).resolves.toEqual({ success: false, error: "DB write failed" });
  });
});

describe("deleteTeamAction", () => {
  beforeEach(resetAll);

  it("requires GLOBAL admin, deletes, revalidates and redirects", async () => {
    const { deleteTeamAction } = await import("./actions");
    await deleteTeamAction("team-del");
    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(deleteTeamMock).toHaveBeenCalledWith("team-del");
    expect(redirectMock).toHaveBeenCalledWith("/admin/teams");
  });

  it("a team admin (canManageTeam true) CANNOT delete the team", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    canManageTeamMock.mockResolvedValue(true);
    const { deleteTeamAction } = await import("./actions");
    // On a permission failure the action returns a structured result and never
    // reaches redirect().
    await expect(deleteTeamAction("team-del")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(deleteTeamMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("setBudgetAction", () => {
  beforeEach(resetAll);

  it("a team admin (canManageTeam true) CANNOT set the budget", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    canManageTeamMock.mockResolvedValue(true);
    const { setBudgetAction } = await import("./actions");
    await expect(
      setBudgetAction("team-b", "100", "2026-01-01", "2026-02-01"),
    ).resolves.toEqual({ success: false, error: "Forbidden" });
  });

  it("returns the 'Period end must be after period start' message inline", async () => {
    const { setBudgetAction } = await import("./actions");
    await expect(
      setBudgetAction("team-b", "100", "2026-02-01", "2026-01-01"),
    ).resolves.toEqual({
      success: false,
      error: "Period end must be after period start",
    });
    expect(dbInsertOnConflictMock).not.toHaveBeenCalled();
  });

  it("persists a valid budget and returns success", async () => {
    const { setBudgetAction } = await import("./actions");
    await expect(
      setBudgetAction("team-b", "100", "2026-01-01", "2026-02-01"),
    ).resolves.toEqual({ success: true, data: undefined });
    expect(dbInsertOnConflictMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-b");
  });
});

// ── team-manage actions (global admin OR team admin) ──────────────────────────

describe("addTeamMemberAction", () => {
  beforeEach(resetAll);

  it("authorizes via canManageTeam(actor, teamId), looks up user by email and adds", async () => {
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-8", "alice@asafe.ai", "member");

    expect(canManageTeamMock).toHaveBeenCalledWith("actor-1", "team-8");
    expect(addTeamMemberMock).toHaveBeenCalledWith(
      "team-8",
      "u1",
      "member",
      "alice@asafe.ai",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-8");
  });

  it("does NOT require global admin (team admin path never calls requireAdminPermission)", async () => {
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-8", "alice@asafe.ai", "member");
    expect(requireAdminPermissionMock).not.toHaveBeenCalled();
  });

  it("returns a structured Unauthorized failure when canManageTeam is false (plain member / outsider)", async () => {
    canManageTeamMock.mockResolvedValue(false);
    const { addTeamMemberAction } = await import("./actions");
    const result = await addTeamMemberAction(
      "team-8",
      "alice@asafe.ai",
      "member",
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("Unauthorized");
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns a structured Unauthorized failure when unauthenticated", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const { addTeamMemberAction } = await import("./actions");
    const result = await addTeamMemberAction(
      "team-8",
      "alice@asafe.ai",
      "member",
    );
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("Unauthorized");
    expect(canManageTeamMock).not.toHaveBeenCalled();
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("returns 'User not found' when email has no matching DB record", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([]);
    const { addTeamMemberAction } = await import("./actions");
    await expect(
      addTeamMemberAction("team-8", "unknown@ghost.io", "member"),
    ).resolves.toEqual({ success: false, error: "User not found" });
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it("authorization runs before the member is added", async () => {
    const callOrder: string[] = [];
    canManageTeamMock.mockImplementationOnce(async () => {
      callOrder.push("authz");
      return true;
    });
    addTeamMemberMock.mockImplementationOnce(async () => {
      callOrder.push("add");
    });
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-x", "alice@asafe.ai", "member");
    expect(callOrder).toEqual(["authz", "add"]);
  });
});

describe("removeTeamMemberAction", () => {
  beforeEach(resetAll);

  it("authorizes via canManageTeam and removes with team-scoped delete", async () => {
    const { removeTeamMemberAction } = await import("./actions");
    await removeTeamMemberAction("member-1", "team-9");

    expect(canManageTeamMock).toHaveBeenCalledWith("actor-1", "team-9");
    // teamId forwarded — scopes the delete so a team admin cannot remove
    // members of other teams via a foreign memberId.
    expect(removeTeamMemberMock).toHaveBeenCalledWith("member-1", "team-9");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-9");
  });

  it("returns a structured failure and does not remove when canManageTeam is false", async () => {
    canManageTeamMock.mockResolvedValue(false);
    const { removeTeamMemberAction } = await import("./actions");
    const result = await removeTeamMemberAction("m1", "t1");
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("Unauthorized");
    expect(removeTeamMemberMock).not.toHaveBeenCalled();
  });

  it("removeTeamMember called exactly once per action", async () => {
    const { removeTeamMemberAction } = await import("./actions");
    await removeTeamMemberAction("member-3", "team-11");
    expect(removeTeamMemberMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateMemberRoleAction", () => {
  beforeEach(resetAll);

  it("authorizes via canManageTeam and updates with team-scoped query", async () => {
    const { updateMemberRoleAction } = await import("./actions");
    await updateMemberRoleAction("member-5", "team-12", "editor");

    expect(canManageTeamMock).toHaveBeenCalledWith("actor-1", "team-12");
    expect(updateTeamMemberRoleMock).toHaveBeenCalledWith(
      "member-5",
      "editor",
      "team-12",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-12");
  });

  it("returns a structured failure when canManageTeam is false", async () => {
    canManageTeamMock.mockResolvedValue(false);
    const { updateMemberRoleAction } = await import("./actions");
    const result = await updateMemberRoleAction("member-5", "team-12", "admin");
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("Unauthorized");
    expect(updateTeamMemberRoleMock).not.toHaveBeenCalled();
  });
});

describe("renameTeamAction", () => {
  beforeEach(resetAll);

  it("authorizes via canManageTeam and updates name/description", async () => {
    const { renameTeamAction } = await import("./actions");
    await renameTeamAction("team-13", "New Name", "desc");

    expect(canManageTeamMock).toHaveBeenCalledWith("actor-1", "team-13");
    expect(updateTeamMock).toHaveBeenCalledWith("team-13", {
      name: "New Name",
      description: "desc",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-13");
  });

  it("returns a structured failure when canManageTeam is false", async () => {
    canManageTeamMock.mockResolvedValue(false);
    const { renameTeamAction } = await import("./actions");
    const result = await renameTeamAction("team-13", "New Name");
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("Unauthorized");
    expect(updateTeamMock).not.toHaveBeenCalled();
  });
});
