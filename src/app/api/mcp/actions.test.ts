import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mcpClientsManagerMock, mcpRepositoryMock, mcpOAuthRepositoryMock, getCurrentUserMock, canCreateMCPMock, canManageMCPServerMock, canShareMCPServerMock } = vi.hoisted(() => ({
  mcpClientsManagerMock: {
    getClients: vi.fn(),
    getClient: vi.fn(),
    persistClient: vi.fn(),
    removeClient: vi.fn(),
    refreshClient: vi.fn(),
    toolCall: vi.fn(),
    toolCallByServerName: vi.fn(),
  },
  mcpRepositoryMock: {
    selectAllForUser: vi.fn(),
    selectById: vi.fn(),
    existsByServerName: vi.fn(),
    updateVisibility: vi.fn(),
  },
  mcpOAuthRepositoryMock: {
    getAuthenticatedSession: vi.fn(),
  },
  getCurrentUserMock: vi.fn(),
  canCreateMCPMock: vi.fn(),
  canManageMCPServerMock: vi.fn(),
  canShareMCPServerMock: vi.fn(),
}));

vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: mcpClientsManagerMock,
}));

vi.mock("lib/db/repository", () => ({
  mcpRepository: mcpRepositoryMock,
  mcpOAuthRepository: mcpOAuthRepositoryMock,
}));

vi.mock("lib/auth/permissions", () => ({
  getCurrentUser: getCurrentUserMock,
  canCreateMCP: canCreateMCPMock,
  canManageMCPServer: canManageMCPServerMock,
  canShareMCPServer: canShareMCPServerMock,
}));

import {
  selectMcpClientsAction,
  selectMcpClientAction,
  saveMcpClientAction,
  existMcpClientByServerNameAction,
  removeMcpClientAction,
  callMcpToolAction,
  callMcpToolByServerNameAction,
  shareMcpServerAction,
} from "./actions";

const mockUser = { id: "user-1", role: "user" as const };
const mockAdminUser = { id: "admin-1", role: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectMcpClientsAction", () => {
  it("returns empty array when no user", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const result = await selectMcpClientsAction();
    expect(result).toEqual([]);
  });

  it("returns filtered clients for current user", async () => {
    getCurrentUserMock.mockResolvedValue(mockUser);
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([
      { id: "server-1", userId: "user-1", visibility: "private" },
    ]);
    mcpClientsManagerMock.getClients.mockResolvedValue([
      {
        id: "server-1",
        client: {
          getInfo: vi.fn(() => ({ name: "My MCP", status: "connected" })),
        },
      },
      {
        id: "server-2",
        client: {
          getInfo: vi.fn(() => ({ name: "Other MCP", status: "connected" })),
        },
      },
    ]);

    const result = await selectMcpClientsAction();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("server-1");
    expect(result[0].isOwner).toBe(true);
    expect(result[0].canManage).toBe(true);
  });

  it("sets isOwner false for other user's server", async () => {
    getCurrentUserMock.mockResolvedValue(mockUser);
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([
      { id: "server-1", userId: "other-user", visibility: "public" },
    ]);
    mcpClientsManagerMock.getClients.mockResolvedValue([
      {
        id: "server-1",
        client: { getInfo: vi.fn(() => ({ name: "Shared MCP" })) },
      },
    ]);

    const result = await selectMcpClientsAction();
    expect(result[0].isOwner).toBe(false);
    expect(result[0].canManage).toBe(false);
  });

  it("sets canManage true for admin", async () => {
    getCurrentUserMock.mockResolvedValue(mockAdminUser);
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([
      { id: "server-1", userId: "other-user", visibility: "public" },
    ]);
    mcpClientsManagerMock.getClients.mockResolvedValue([
      {
        id: "server-1",
        client: { getInfo: vi.fn(() => ({ name: "Public MCP" })) },
      },
    ]);

    const result = await selectMcpClientsAction();
    expect(result[0].canManage).toBe(true);
  });
});

describe("selectMcpClientAction", () => {
  it("returns client info when found", async () => {
    mcpClientsManagerMock.getClient.mockResolvedValue({
      client: {
        getInfo: vi.fn(() => ({ name: "My MCP", status: "connected" })),
      },
    });

    const result = await selectMcpClientAction("server-1");
    expect(result.id).toBe("server-1");
    expect(result.name).toBe("My MCP");
  });

  it("throws when client not found", async () => {
    mcpClientsManagerMock.getClient.mockResolvedValue(null);
    await expect(selectMcpClientAction("unknown")).rejects.toThrow("Client not found");
  });
});

describe("saveMcpClientAction", () => {
  it("throws when NOT_ALLOW_ADD_MCP_SERVERS is set", async () => {
    process.env.NOT_ALLOW_ADD_MCP_SERVERS = "true";
    await expect(
      saveMcpClientAction({ name: "my-server" } as Parameters<typeof saveMcpClientAction>[0]),
    ).rejects.toThrow("Not allowed to add MCP servers");
    delete process.env.NOT_ALLOW_ADD_MCP_SERVERS;
  });

  it("throws when user is not logged in", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(
      saveMcpClientAction({ name: "my-server" } as Parameters<typeof saveMcpClientAction>[0]),
    ).rejects.toThrow("You must be logged in");
  });

  it("throws when user lacks permission", async () => {
    getCurrentUserMock.mockResolvedValue(mockUser);
    canCreateMCPMock.mockResolvedValue(false);
    await expect(
      saveMcpClientAction({ name: "my-server" } as Parameters<typeof saveMcpClientAction>[0]),
    ).rejects.toThrow("You don't have permission");
  });

  it("throws on invalid server name (special chars)", async () => {
    getCurrentUserMock.mockResolvedValue(mockUser);
    canCreateMCPMock.mockResolvedValue(true);
    await expect(
      saveMcpClientAction({ name: "my server!" } as Parameters<typeof saveMcpClientAction>[0]),
    ).rejects.toThrow("alphanumeric characters");
  });

  it("saves private server successfully", async () => {
    getCurrentUserMock.mockResolvedValue(mockUser);
    canCreateMCPMock.mockResolvedValue(true);
    mcpClientsManagerMock.persistClient.mockResolvedValue("server-123");

    const result = await saveMcpClientAction({
      name: "my-server",
      visibility: "private",
    } as Parameters<typeof saveMcpClientAction>[0]);

    expect(result).toBe("server-123");
    expect(mcpClientsManagerMock.persistClient).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", visibility: "private" }),
    );
  });

  it("throws when non-admin tries to create public server", async () => {
    getCurrentUserMock.mockResolvedValue(mockUser);
    canCreateMCPMock.mockResolvedValue(true);
    canShareMCPServerMock.mockResolvedValue(false);

    await expect(
      saveMcpClientAction({ name: "public-server", visibility: "public" } as Parameters<typeof saveMcpClientAction>[0]),
    ).rejects.toThrow("Only administrators can feature MCP servers");
  });

  it("throws on duplicate public server name", async () => {
    getCurrentUserMock.mockResolvedValue(mockAdminUser);
    canCreateMCPMock.mockResolvedValue(true);
    canShareMCPServerMock.mockResolvedValue(true);
    mcpRepositoryMock.existsByServerName.mockResolvedValue(true);

    await expect(
      saveMcpClientAction({ name: "existing-server", visibility: "public" } as Parameters<typeof saveMcpClientAction>[0]),
    ).rejects.toThrow("A featured MCP server with this name already exists");
  });
});

describe("existMcpClientByServerNameAction", () => {
  it("returns repository result", async () => {
    mcpRepositoryMock.existsByServerName.mockResolvedValue(true);
    const result = await existMcpClientByServerNameAction("my-server");
    expect(result).toBe(true);
    expect(mcpRepositoryMock.existsByServerName).toHaveBeenCalledWith("my-server");
  });
});

describe("removeMcpClientAction", () => {
  it("throws when server not found", async () => {
    mcpRepositoryMock.selectById.mockResolvedValue(null);
    await expect(removeMcpClientAction("unknown")).rejects.toThrow("MCP server not found");
  });

  it("throws when user lacks permission", async () => {
    mcpRepositoryMock.selectById.mockResolvedValue({
      id: "s1",
      userId: "other",
      visibility: "private",
    });
    canManageMCPServerMock.mockResolvedValue(false);
    await expect(removeMcpClientAction("s1")).rejects.toThrow(
      "You don't have permission to delete",
    );
  });

  it("removes client when user has permission", async () => {
    mcpRepositoryMock.selectById.mockResolvedValue({
      id: "s1",
      userId: "user-1",
      visibility: "private",
    });
    canManageMCPServerMock.mockResolvedValue(true);
    mcpClientsManagerMock.removeClient.mockResolvedValue(undefined);

    await removeMcpClientAction("s1");
    expect(mcpClientsManagerMock.removeClient).toHaveBeenCalledWith("s1");
  });
});

describe("callMcpToolAction", () => {
  it("delegates to mcpClientsManager.toolCall", async () => {
    mcpClientsManagerMock.toolCall.mockResolvedValue({ result: "ok" });
    const result = await callMcpToolAction("server-1", "search", { q: "test" });
    expect(result).toEqual({ result: "ok" });
    expect(mcpClientsManagerMock.toolCall).toHaveBeenCalledWith("server-1", "search", { q: "test" });
  });
});

describe("callMcpToolByServerNameAction", () => {
  it("delegates to mcpClientsManager.toolCallByServerName", async () => {
    mcpClientsManagerMock.toolCallByServerName.mockResolvedValue({ data: "value" });
    const result = await callMcpToolByServerNameAction("exa", "search", { query: "test" });
    expect(result).toEqual({ data: "value" });
  });
});

describe("shareMcpServerAction", () => {
  it("throws when user cannot share", async () => {
    canShareMCPServerMock.mockResolvedValue(false);
    await expect(shareMcpServerAction("server-1", "public")).rejects.toThrow(
      "Only administrators can feature MCP servers",
    );
  });

  it("updates visibility when admin", async () => {
    canShareMCPServerMock.mockResolvedValue(true);
    mcpRepositoryMock.updateVisibility.mockResolvedValue(undefined);

    const result = await shareMcpServerAction("server-1", "public");
    expect(result).toEqual({ success: true });
    expect(mcpRepositoryMock.updateVisibility).toHaveBeenCalledWith("server-1", "public");
  });

  it("can set visibility to private", async () => {
    canShareMCPServerMock.mockResolvedValue(true);
    mcpRepositoryMock.updateVisibility.mockResolvedValue(undefined);

    await shareMcpServerAction("server-1", "private");
    expect(mcpRepositoryMock.updateVisibility).toHaveBeenCalledWith("server-1", "private");
  });
});
