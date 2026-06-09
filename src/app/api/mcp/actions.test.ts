import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getCurrentUserMock,
  canCreateMCPMock,
  insertMcpServerMock,
  refreshClientMock,
  getClientsMock,
  selectAllForUserMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  canCreateMCPMock: vi.fn(),
  insertMcpServerMock: vi.fn(),
  refreshClientMock: vi.fn(),
  getClientsMock: vi.fn(),
  selectAllForUserMock: vi.fn(),
}));

vi.mock("lib/auth/permissions", () => ({
  getCurrentUser: getCurrentUserMock,
  canCreateMCP: canCreateMCPMock,
  canManageMCPServer: vi.fn().mockResolvedValue(true),
  canShareMCPServer: vi.fn().mockResolvedValue(true),
}));
vi.mock("lib/db/repository", () => ({
  mcpRepository: {
    insertMcpServer: insertMcpServerMock,
    selectAllForUser: selectAllForUserMock,
  },
  mcpOAuthRepository: {},
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    refreshClient: refreshClientMock,
    getClient: vi.fn().mockResolvedValue(null),
    getClients: getClientsMock,
  },
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
    await expect(saveMcpClientAction({ name: "Test", config: { url: "http://mcp" } } as any))
      .rejects.toThrow(/logged in/i);
  });

  it("throws when user cannot create MCP", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: { url: "http://mcp" } } as any))
      .rejects.toThrow(/permission/i);
  });

  it("throws when NOT_ALLOW_ADD_MCP_SERVERS env is set", async () => {
    process.env.NOT_ALLOW_ADD_MCP_SERVERS = "1";
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any))
      .rejects.toThrow(/Not allowed/i);
  });

  it("throws for non-admin trying to create org-scoped server", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "valid-name", scope: "org", config: {} } as any))
      .rejects.toThrow(/admin/i);
  });

  it("throws for non-admin trying to create team-scoped server", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "valid-name", scope: "team", config: {} } as any))
      .rejects.toThrow(/admin/i);
  });

  it("throws when name contains invalid characters", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "invalid name!", config: {} } as any))
      .rejects.toThrow();
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
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any)).rejects.toThrow();
    expect(insertMcpServerMock).not.toHaveBeenCalled();
  });

  it("never calls insertMcpServer when canCreateMCP returns false", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any)).rejects.toThrow();
    expect(insertMcpServerMock).not.toHaveBeenCalled();
  });

  it("never calls insertMcpServer when env flag blocks request", async () => {
    process.env.NOT_ALLOW_ADD_MCP_SERVERS = "1";
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any)).rejects.toThrow();
    expect(insertMcpServerMock).not.toHaveBeenCalled();
  });
});

describe("selectMcpClientsAction — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
    selectAllForUserMock.mockResolvedValueOnce([{ id: "srv-check", userId: "u1", visibility: "private" }]);
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
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any)).rejects.toThrow();
  });

  it("getCurrentUser called exactly once per invocation", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any)).rejects.toThrow();
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });

  it("canCreateMCP not called when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: {} } as any)).rejects.toThrow();
    expect(canCreateMCPMock).not.toHaveBeenCalled();
  });

  it("throws for org scope from non-admin user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-basic", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "valid-name", scope: "org", config: {} } as any)).rejects.toThrow(/admin/i);
  });
});

describe("selectMcpClientsAction — return type invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

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
    selectAllForUserMock.mockResolvedValueOnce([{ id: "mcp-1", name: "Test", config: { url: "http://mcp" } }]);
    getClientsMock.mockReturnValue([]);
    const { selectMcpClientsAction } = await import("./actions");
    const result = await selectMcpClientsAction();
    if (result.length > 0) expect(result[0]).toHaveProperty("id");
    else expect(result).toEqual([]);
  });

  it("throws when user is not authenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { selectMcpClientsAction } = await import("./actions");
    await expect(selectMcpClientsAction()).rejects.toThrow();
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
