import { describe, it, expect, vi, beforeEach } from "vitest";

// ── shared hoisted mocks ───────────────────────────────────────────────────────

const { requireAdminPermissionMock, revalidatePathMock, updateTeamPolicyMock, addTeamMemberMock, removeTeamMemberMock, dbSelectLimitMock, dbInsertOnConflictMock } = vi.hoisted(() => ({
  requireAdminPermissionMock: vi.fn().mockResolvedValue(undefined),
  revalidatePathMock: vi.fn(),
  updateTeamPolicyMock: vi.fn().mockResolvedValue(undefined),
  addTeamMemberMock: vi.fn().mockResolvedValue(undefined),
  removeTeamMemberMock: vi.fn().mockResolvedValue(undefined),
  dbSelectLimitMock: vi.fn().mockResolvedValue([{ id: "u1", email: "alice@asafe.ai" }]),
  dbInsertOnConflictMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: requireAdminPermissionMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("lib/admin/teams", () => ({
  addTeamMember: addTeamMemberMock,
  removeTeamMember: removeTeamMemberMock,
  updateTeamPolicy: updateTeamPolicyMock,
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

// ── test suites ───────────────────────────────────────────────────────────────

describe("setModelAllowListAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("requires admin, then calls updateTeamPolicy with modelAllowList", async () => {
    const { setModelAllowListAction } = await import("./actions");
    await setModelAllowListAction("team-1", ["gpt-5.1", "claude-opus-4.8"]);

    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-1", { modelAllowList: ["gpt-5.1", "claude-opus-4.8"] });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-1");
  });

  it("accepts an empty array to clear restrictions", async () => {
    const { setModelAllowListAction } = await import("./actions");
    await setModelAllowListAction("team-2", []);

    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-2", { modelAllowList: [] });
  });

  it("throws if requireAdminPermission rejects", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { setModelAllowListAction } = await import("./actions");
    await expect(setModelAllowListAction("team-1", [])).rejects.toThrow("Forbidden");
    expect(updateTeamPolicyMock).not.toHaveBeenCalled();
  });
});

describe("setEmailDomainsAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("requires admin, then calls updateTeamPolicy with allowedEmailDomains", async () => {
    const { setEmailDomainsAction } = await import("./actions");
    await setEmailDomainsAction("team-3", ["asafe.ai", "corp.example.com"]);

    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-3", { allowedEmailDomains: ["asafe.ai", "corp.example.com"] });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-3");
  });

  it("accepts an empty array to remove domain restrictions", async () => {
    const { setEmailDomainsAction } = await import("./actions");
    await setEmailDomainsAction("team-4", []);

    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-4", { allowedEmailDomains: [] });
  });

  it("revalidates the correct path", async () => {
    const { setEmailDomainsAction } = await import("./actions");
    await setEmailDomainsAction("team-xyz", ["example.org"]);

    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-xyz");
  });
});

describe("setPolicyAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("requires admin, then calls updateTeamPolicy with the full patch", async () => {
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

  it("forwards partial patches (only some fields)", async () => {
    const { setPolicyAction } = await import("./actions");
    await setPolicyAction("team-6", { guardrailPolicy: "permissive" });

    expect(updateTeamPolicyMock).toHaveBeenCalledWith("team-6", { guardrailPolicy: "permissive" });
  });

  it("propagates errors from updateTeamPolicy", async () => {
    updateTeamPolicyMock.mockRejectedValueOnce(new Error("DB write failed"));
    const { setPolicyAction } = await import("./actions");
    await expect(setPolicyAction("team-7", { allowSpeech: true })).rejects.toThrow("DB write failed");
  });
});

describe("addTeamMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: user found
    dbSelectLimitMock.mockResolvedValue([{ id: "u1", email: "alice@asafe.ai" }]);
  });

  it("looks up user by email and calls addTeamMember with userEmail", async () => {
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-8", "alice@asafe.ai", "member");

    expect(addTeamMemberMock).toHaveBeenCalledWith("team-8", "u1", "member", "alice@asafe.ai");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-8");
  });

  it("throws 'User not found' when email has no matching DB record", async () => {
    dbSelectLimitMock.mockResolvedValueOnce([]);
    const { addTeamMemberAction } = await import("./actions");
    await expect(addTeamMemberAction("team-8", "unknown@ghost.io", "member")).rejects.toThrow("User not found");
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });
});

describe("removeTeamMemberAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("requires admin, calls removeTeamMember, and revalidates", async () => {
    const { removeTeamMemberAction } = await import("./actions");
    await removeTeamMemberAction("member-1", "team-9");

    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
    expect(removeTeamMemberMock).toHaveBeenCalledWith("member-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-9");
  });
});

describe("addTeamMemberAction — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbSelectLimitMock.mockResolvedValue([{ id: "u1", email: "alice@asafe.ai" }]);
  });

  it("requireAdminPermission called before addTeamMember", async () => {
    const callOrder: string[] = [];
    requireAdminPermissionMock.mockImplementationOnce(async () => { callOrder.push("admin"); });
    addTeamMemberMock.mockImplementationOnce(async () => { callOrder.push("add"); });
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-x", "alice@asafe.ai", "member");
    expect(callOrder[0]).toBe("admin");
    expect(callOrder[1]).toBe("add");
  });

  it("revalidates the correct team path", async () => {
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-path-check", "alice@asafe.ai", "admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-path-check");
  });

  it("addTeamMember called exactly once on success", async () => {
    const { addTeamMemberAction } = await import("./actions");
    await addTeamMemberAction("team-once", "alice@asafe.ai", "member");
    expect(addTeamMemberMock).toHaveBeenCalledTimes(1);
  });
});

describe("setModelAllowListAction — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("revalidates correct team path", async () => {
    const { setModelAllowListAction } = await import("./actions");
    await setModelAllowListAction("team-revalidate", ["model-a"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teams/team-revalidate");
  });

  it("updateTeamPolicy not called when permission is denied", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { setModelAllowListAction } = await import("./actions");
    await expect(setModelAllowListAction("team-x", [])).rejects.toThrow("Forbidden");
    expect(updateTeamPolicyMock).not.toHaveBeenCalled();
  });

  it("updateTeamPolicy called exactly once on success", async () => {
    const { setModelAllowListAction } = await import("./actions");
    await setModelAllowListAction("team-count", ["m1", "m2"]);
    expect(updateTeamPolicyMock).toHaveBeenCalledTimes(1);
  });
});
