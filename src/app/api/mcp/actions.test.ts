import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  canCreateMCPMock,
  canManageMCPServerMock,
  insertMcpServerMock,
  refreshClientMock,
  getClientsMock,
  selectAllForUserMock,
  selectByIdMock,
  updateDisabledToolsMock,
  setDisabledToolsMock,
  persistClientMock,
  armLocalServerMock,
  localServerArmedUntilMock,
  getUserPrimaryTeamIdMock,
  resolveLocalMcpPolicyMock,
  writeAuditLogMock,
  findOpenLocalMcpArmRequestMock,
  resolveOpenLocalMcpArmRequestsMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  canCreateMCPMock: vi.fn(),
  canManageMCPServerMock: vi.fn().mockResolvedValue(true),
  insertMcpServerMock: vi.fn(),
  refreshClientMock: vi.fn(),
  getClientsMock: vi.fn(),
  selectAllForUserMock: vi.fn(),
  selectByIdMock: vi.fn(),
  updateDisabledToolsMock: vi.fn(),
  setDisabledToolsMock: vi.fn(),
  persistClientMock: vi.fn(),
  armLocalServerMock: vi.fn(),
  localServerArmedUntilMock: vi.fn(),
  getUserPrimaryTeamIdMock: vi.fn().mockResolvedValue(null),
  resolveLocalMcpPolicyMock: vi.fn().mockResolvedValue(false),
  writeAuditLogMock: vi.fn().mockResolvedValue(undefined),
  findOpenLocalMcpArmRequestMock: vi.fn().mockResolvedValue(null),
  resolveOpenLocalMcpArmRequestsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("lib/auth/permissions", () => ({
  getCurrentUser: getCurrentUserMock,
  canCreateMCP: canCreateMCPMock,
  canManageMCPServer: canManageMCPServerMock,
  canShareMCPServer: vi.fn().mockResolvedValue(true),
}));
vi.mock("lib/db/repository", () => ({
  mcpRepository: {
    insertMcpServer: insertMcpServerMock,
    selectAllForUser: selectAllForUserMock,
    selectById: selectByIdMock,
    updateDisabledTools: updateDisabledToolsMock,
  },
  mcpOAuthRepository: {},
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    refreshClient: refreshClientMock,
    getClient: vi.fn().mockResolvedValue(null),
    getClients: getClientsMock,
    setDisabledTools: setDisabledToolsMock,
    persistClient: persistClientMock,
    armLocalServer: armLocalServerMock,
    localServerArmedUntil: localServerArmedUntilMock,
  },
}));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
}));
vi.mock("lib/ai/mcp/local-policy", () => ({
  resolveLocalMcpPolicy: resolveLocalMcpPolicyMock,
}));
vi.mock("lib/compliance/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));
vi.mock("lib/agent-platform/approvals", () => ({
  findOpenLocalMcpArmRequest: findOpenLocalMcpArmRequestMock,
  resolveOpenLocalMcpArmRequests: resolveOpenLocalMcpArmRequestsMock,
}));
vi.mock("lib/db/pg/schema.pg", () => ({ McpServerTable: {} }));
vi.mock("better-auth", () => ({ logger: { error: vi.fn() } }));

describe("saveMcpClientAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NOT_ALLOW_ADD_MCP_SERVERS;
  });

  it("throws when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "Test",
        config: { url: "http://mcp" },
      } as any),
    ).rejects.toThrow(/logged in/i);
  });

  it("throws when user cannot create MCP", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "Test",
        config: { url: "http://mcp" },
      } as any),
    ).rejects.toThrow(/permission/i);
  });

  it("throws when NOT_ALLOW_ADD_MCP_SERVERS env is set", async () => {
    process.env.NOT_ALLOW_ADD_MCP_SERVERS = "1";
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow(/Not allowed/i);
  });

  it("throws for non-admin trying to create org-scoped server", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "valid-name",
        scope: "org",
        config: {},
      } as any),
    ).rejects.toThrow(/admin/i);
  });

  it("throws for non-admin trying to create team-scoped server", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "valid-name",
        scope: "team",
        config: {},
      } as any),
    ).rejects.toThrow(/admin/i);
  });

  it("throws when name contains invalid characters", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "invalid name!", config: {} } as any),
    ).rejects.toThrow();
  });
});

describe("selectMcpClientsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(result).toEqual([]);
  });

  it("returns filtered clients for authenticated user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([
      { id: "srv-1", userId: "u1", visibility: "private" },
    ]);
    getClientsMock.mockResolvedValueOnce([
      {
        id: "srv-1",
        client: { getInfo: () => ({ name: "Test Server", tools: [] }) },
      },
      {
        id: "srv-other",
        client: { getInfo: () => ({ name: "Other Server", tools: [] }) },
      },
    ]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("srv-1");
  });

  it("returns empty array when user has no accessible servers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([]);
    getClientsMock.mockResolvedValueOnce([]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(result).toEqual([]);
  });

  it("never calls selectAllForUser when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    await selectMcpClientsAction();
    expect(selectAllForUserMock).not.toHaveBeenCalled();
  });

  it("result is always an array", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(Array.isArray(result)).toBe(true);
  });

  it("getCurrentUser called exactly once per invocation", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    await selectMcpClientsAction();
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });
});

describe("saveMcpClientAction — guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NOT_ALLOW_ADD_MCP_SERVERS;
  });

  it("never calls insertMcpServer when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow();
    expect(insertMcpServerMock).not.toHaveBeenCalled();
  });

  it("never calls insertMcpServer when canCreateMCP returns false", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow();
    expect(insertMcpServerMock).not.toHaveBeenCalled();
  });

  it("never calls insertMcpServer when env flag blocks request", async () => {
    process.env.NOT_ALLOW_ADD_MCP_SERVERS = "1";
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow();
    expect(insertMcpServerMock).not.toHaveBeenCalled();
  });
});

describe("selectMcpClientsAction — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns array with matching client for each user server", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([
      { id: "s1", userId: "u1", visibility: "private" },
      { id: "s2", userId: "u1", visibility: "private" },
    ]);
    getClientsMock.mockResolvedValueOnce([
      { id: "s1", client: { getInfo: () => ({ tools: [] }) } },
      { id: "s2", client: { getInfo: () => ({ tools: [] }) } },
    ]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(result).toHaveLength(2);
  });

  it("never calls getClients when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    await selectMcpClientsAction();
    expect(getClientsMock).not.toHaveBeenCalled();
  });

  it("result items have id field", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([
      { id: "srv-check", userId: "u1", visibility: "private" },
    ]);
    getClientsMock.mockResolvedValueOnce([
      { id: "srv-check", client: { getInfo: () => ({ tools: [] }) } },
    ]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(result[0]).toHaveProperty("id", "srv-check");
  });

  it("returns empty array not null when no servers found", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([]);
    getClientsMock.mockResolvedValueOnce([]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(result).not.toBeNull();
    expect(result).toEqual([]);
  });
});

describe("saveMcpClientAction — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NOT_ALLOW_ADD_MCP_SERVERS;
  });

  it("throws when user is null (not logged in)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow();
  });

  it("getCurrentUser called exactly once per invocation", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow();
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });

  it("canCreateMCP not called when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({ name: "Test", config: {} } as any),
    ).rejects.toThrow();
    expect(canCreateMCPMock).not.toHaveBeenCalled();
  });

  it("throws for org scope from non-admin user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-basic", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "valid-name",
        scope: "org",
        config: {},
      } as any),
    ).rejects.toThrow(/admin/i);
  });
});

describe("setMcpToolEnabledAction", () => {
  const baseServer = {
    id: "srv-1",
    name: "github",
    config: { url: "http://mcp" },
    userId: "owner-1",
    visibility: "private" as const,
    disabledTools: null as string[] | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    canManageMCPServerMock.mockResolvedValue(true);
    updateDisabledToolsMock.mockResolvedValue(undefined);
  });

  it("throws when the server does not exist", async () => {
    selectByIdMock.mockResolvedValue(null);
    const { setMcpToolEnabledAction } = await import("./actions");
    await expect(
      setMcpToolEnabledAction("missing", "create_issue", false),
    ).rejects.toThrow(/not found/i);
    expect(updateDisabledToolsMock).not.toHaveBeenCalled();
  });

  it("throws when the user cannot manage the server", async () => {
    selectByIdMock.mockResolvedValue(baseServer);
    canManageMCPServerMock.mockResolvedValue(false);
    const { setMcpToolEnabledAction } = await import("./actions");
    await expect(
      setMcpToolEnabledAction("srv-1", "create_issue", false),
    ).rejects.toThrow(/permission/i);
    expect(updateDisabledToolsMock).not.toHaveBeenCalled();
    expect(setDisabledToolsMock).not.toHaveBeenCalled();
  });

  it("checks permission against the server owner and visibility", async () => {
    selectByIdMock.mockResolvedValue({
      ...baseServer,
      visibility: "public" as const,
    });
    const { setMcpToolEnabledAction } = await import("./actions");
    await setMcpToolEnabledAction("srv-1", "create_issue", false);
    expect(canManageMCPServerMock).toHaveBeenCalledWith("owner-1", "public");
  });

  it("disabling a tool adds it to disabledTools", async () => {
    selectByIdMock.mockResolvedValue(baseServer);
    const { setMcpToolEnabledAction } = await import("./actions");
    const result = await setMcpToolEnabledAction(
      "srv-1",
      "create_issue",
      false,
    );
    expect(updateDisabledToolsMock).toHaveBeenCalledWith("srv-1", [
      "create_issue",
    ]);
    expect(result.disabledTools).toEqual(["create_issue"]);
  });

  it("re-enabling a tool removes it from disabledTools", async () => {
    selectByIdMock.mockResolvedValue({
      ...baseServer,
      disabledTools: ["create_issue", "delete_repo"],
    });
    const { setMcpToolEnabledAction } = await import("./actions");
    const result = await setMcpToolEnabledAction("srv-1", "create_issue", true);
    expect(updateDisabledToolsMock).toHaveBeenCalledWith("srv-1", [
      "delete_repo",
    ]);
    expect(result.disabledTools).toEqual(["delete_repo"]);
  });

  it("disabling an already-disabled tool does not duplicate it", async () => {
    selectByIdMock.mockResolvedValue({
      ...baseServer,
      disabledTools: ["create_issue"],
    });
    const { setMcpToolEnabledAction } = await import("./actions");
    const result = await setMcpToolEnabledAction(
      "srv-1",
      "create_issue",
      false,
    );
    expect(result.disabledTools).toEqual(["create_issue"]);
  });

  it("updates the in-memory manager gate so enforcement is immediate", async () => {
    selectByIdMock.mockResolvedValue(baseServer);
    const { setMcpToolEnabledAction } = await import("./actions");
    await setMcpToolEnabledAction("srv-1", "create_issue", false);
    expect(setDisabledToolsMock).toHaveBeenCalledWith("srv-1", [
      "create_issue",
    ]);
  });

  it("rejects empty tool names", async () => {
    const { setMcpToolEnabledAction } = await import("./actions");
    await expect(setMcpToolEnabledAction("srv-1", "", false)).rejects.toThrow();
    expect(updateDisabledToolsMock).not.toHaveBeenCalled();
  });
});

describe("selectMcpClientsAction — return type invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns an array even with no MCP clients configured", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([]);
    getClientsMock.mockReturnValue([]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    expect(Array.isArray(result)).toBe(true);
  });

  it("each MCP client item has id field", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([
      { id: "mcp-1", name: "Test", config: { url: "http://mcp" } },
    ]);
    getClientsMock.mockReturnValue([]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    if (result.length > 0) expect(result[0]).toHaveProperty("id");
    else expect(result).toEqual([]);
  });

  it("returns empty array when user is not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    await expect(selectMcpClientsAction()).resolves.toEqual([]);
  });

  it("getCurrentUser called exactly once per selectMcpClientsAction call", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([]);
    getClientsMock.mockReturnValue([]);
    const { selectMcpClientsAction } = await import("./actions");
    await selectMcpClientsAction();
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });
});

// ── Local-MCP governance plane (ADR-0010, default-deny per ADR-0009) ─────────

const STDIO_CONFIG = { command: "npx", args: ["-y", "some-mcp"] };

// Partial payloads cast through unknown (the schema module is mocked, so the
// inferred insert type is unavailable; the action validates at runtime).
type SaveMcpPayload = Parameters<
  typeof import("./actions").saveMcpClientAction
>[0];

describe("saveMcpClientAction — local-MCP policy gate (stdio)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NOT_ALLOW_ADD_MCP_SERVERS;
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValue(true);
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    persistClientMock.mockResolvedValue({ id: "srv-1" });
  });

  it("rejects stdio configs when the policy denies (default)", async () => {
    resolveLocalMcpPolicyMock.mockResolvedValue(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "local-server",
        config: STDIO_CONFIG,
      } as unknown as SaveMcpPayload),
    ).rejects.toThrow(/organization's policy/i);
    expect(persistClientMock).not.toHaveBeenCalled();
  });

  it("resolves the policy for the saving user's team", async () => {
    resolveLocalMcpPolicyMock.mockResolvedValue(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(
      saveMcpClientAction({
        name: "local-server",
        config: STDIO_CONFIG,
      } as unknown as SaveMcpPayload),
    ).rejects.toThrow();
    expect(getUserPrimaryTeamIdMock).toHaveBeenCalledWith("u1");
    expect(resolveLocalMcpPolicyMock).toHaveBeenCalledWith("team-1");
  });

  it("allows stdio configs when the policy is enabled", async () => {
    resolveLocalMcpPolicyMock.mockResolvedValue(true);
    const { saveMcpClientAction } = await import("./actions");
    await saveMcpClientAction({
      name: "local-server",
      config: STDIO_CONFIG,
    } as unknown as SaveMcpPayload);
    expect(persistClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "local-server", userId: "u1" }),
    );
  });

  it("never resolves the local policy for remote configs", async () => {
    const { saveMcpClientAction } = await import("./actions");
    await saveMcpClientAction({
      name: "remote-server",
      config: { url: "https://mcp.example.com" },
    } as unknown as SaveMcpPayload);
    expect(resolveLocalMcpPolicyMock).not.toHaveBeenCalled();
    expect(persistClientMock).toHaveBeenCalled();
  });
});

describe("armLocalMcpServerAction — per-session consent", () => {
  const stdioServer = {
    id: "srv-local",
    name: "local-server",
    config: STDIO_CONFIG,
    userId: "owner-1",
    visibility: "private" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", role: "user" });
    canManageMCPServerMock.mockResolvedValue(true);
    getUserPrimaryTeamIdMock.mockResolvedValue("team-1");
    resolveLocalMcpPolicyMock.mockResolvedValue(true);
    selectByIdMock.mockResolvedValue(stdioServer);
    armLocalServerMock.mockReturnValue(1234567890);
  });

  it("arms the server and writes an audit event", async () => {
    const { armLocalMcpServerAction } = await import("./actions");
    const result = await armLocalMcpServerAction("srv-local");
    expect(result).toEqual({ armedUntil: 1234567890 });
    expect(armLocalServerMock).toHaveBeenCalledWith("srv-local", {
      grantedBy: "owner-1",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "owner-1",
        teamId: "team-1",
        eventType: "admin_action",
        details: expect.objectContaining({
          action: "local_mcp_server_armed",
          serverId: "srv-local",
        }),
      }),
    );
  });

  it("direct arming resolves open local_mcp_arm requests for the server owner (v2)", async () => {
    resolveOpenLocalMcpArmRequestsMock.mockResolvedValue(["req-1"]);
    const { armLocalMcpServerAction } = await import("./actions");

    await armLocalMcpServerAction("srv-local");

    expect(resolveOpenLocalMcpArmRequestsMock).toHaveBeenCalledWith(
      "srv-local",
      "owner-1",
      { decidedBy: "owner-1" },
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          resolvedApprovalRequestIds: ["req-1"],
        }),
      }),
    );
  });

  it("arming still succeeds when resolving open requests fails (fail-soft)", async () => {
    resolveOpenLocalMcpArmRequestsMock.mockRejectedValue(
      new Error("approvals down"),
    );
    const { armLocalMcpServerAction } = await import("./actions");
    await expect(armLocalMcpServerAction("srv-local")).resolves.toEqual({
      armedUntil: 1234567890,
    });
  });

  it("rejects when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { armLocalMcpServerAction } = await import("./actions");
    await expect(armLocalMcpServerAction("srv-local")).rejects.toThrow(
      /logged in/i,
    );
    expect(armLocalServerMock).not.toHaveBeenCalled();
  });

  it("rejects when the server does not exist", async () => {
    selectByIdMock.mockResolvedValue(null);
    const { armLocalMcpServerAction } = await import("./actions");
    await expect(armLocalMcpServerAction("missing")).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects non-stdio servers", async () => {
    selectByIdMock.mockResolvedValue({
      ...stdioServer,
      config: { url: "https://mcp.example.com" },
    });
    const { armLocalMcpServerAction } = await import("./actions");
    await expect(armLocalMcpServerAction("srv-local")).rejects.toThrow(
      /stdio/i,
    );
    expect(armLocalServerMock).not.toHaveBeenCalled();
  });

  it("rejects users who cannot manage the server", async () => {
    canManageMCPServerMock.mockResolvedValue(false);
    const { armLocalMcpServerAction } = await import("./actions");
    await expect(armLocalMcpServerAction("srv-local")).rejects.toThrow(
      /permission/i,
    );
    expect(armLocalServerMock).not.toHaveBeenCalled();
  });

  it("rejects when the org/team policy denies local MCP", async () => {
    resolveLocalMcpPolicyMock.mockResolvedValue(false);
    const { armLocalMcpServerAction } = await import("./actions");
    await expect(armLocalMcpServerAction("srv-local")).rejects.toThrow(
      /organization's policy/i,
    );
    expect(armLocalServerMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});

describe("getLocalMcpStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    getUserPrimaryTeamIdMock.mockResolvedValue(null);
  });

  it("reports non-stdio servers as not requiring arming", async () => {
    selectByIdMock.mockResolvedValue({
      id: "srv-remote",
      config: { url: "https://mcp.example.com" },
      userId: "u1",
      visibility: "private",
    });
    const { getLocalMcpStatusAction } = await import("./actions");
    await expect(getLocalMcpStatusAction("srv-remote")).resolves.toEqual({
      isStdio: false,
      policyEnabled: false,
      armed: false,
      armedUntil: null,
      pendingApprovalId: null,
    });
  });

  it("reports policy + arming state for stdio servers", async () => {
    selectByIdMock.mockResolvedValue({
      id: "srv-local",
      config: STDIO_CONFIG,
      userId: "u1",
      visibility: "private",
    });
    resolveLocalMcpPolicyMock.mockResolvedValue(true);
    const future = Date.now() + 60_000;
    localServerArmedUntilMock.mockReturnValue(future);
    const { getLocalMcpStatusAction } = await import("./actions");
    await expect(getLocalMcpStatusAction("srv-local")).resolves.toEqual({
      isStdio: true,
      policyEnabled: true,
      armed: true,
      armedUntil: future,
      pendingApprovalId: null,
    });
  });

  it("reports unarmed stdio servers", async () => {
    selectByIdMock.mockResolvedValue({
      id: "srv-local",
      config: STDIO_CONFIG,
      userId: "u1",
      visibility: "private",
    });
    resolveLocalMcpPolicyMock.mockResolvedValue(true);
    localServerArmedUntilMock.mockReturnValue(null);
    const { getLocalMcpStatusAction } = await import("./actions");
    await expect(getLocalMcpStatusAction("srv-local")).resolves.toEqual({
      isStdio: true,
      policyEnabled: true,
      armed: false,
      armedUntil: null,
      pendingApprovalId: null,
    });
  });

  it("surfaces an open local_mcp_arm approval request (v2 consent)", async () => {
    selectByIdMock.mockResolvedValue({
      id: "srv-local",
      config: STDIO_CONFIG,
      userId: "owner-1",
      visibility: "private",
    });
    resolveLocalMcpPolicyMock.mockResolvedValue(true);
    localServerArmedUntilMock.mockReturnValue(null);
    findOpenLocalMcpArmRequestMock.mockResolvedValue({ id: "req-9" });
    const { getLocalMcpStatusAction } = await import("./actions");

    const status = await getLocalMcpStatusAction("srv-local");

    // owner-targeted lookup: keyed by the server owner, not the viewer
    expect(findOpenLocalMcpArmRequestMock).toHaveBeenCalledWith(
      "srv-local",
      "owner-1",
    );
    expect(status.pendingApprovalId).toBe("req-9");
  });
});
