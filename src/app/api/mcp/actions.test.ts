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
});
