import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getCurrentUserMock,
  mcpRepositoryMock,
  mcpClientsManagerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  mcpRepositoryMock: { selectAllForUser: vi.fn() },
  mcpClientsManagerMock: {
    getClients: vi.fn(),
    refreshClient: vi.fn(),
  },
}));

vi.mock("lib/auth/permissions", () => ({
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("lib/db/repository", () => ({
  mcpRepository: mcpRepositoryMock,
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: mcpClientsManagerMock,
}));

import { GET } from "./route";

const makeClientInfo = (id: string, status = "connected") => ({
  enabled: true,
  status,
  error: undefined,
  toolInfo: [{ name: "some-tool" }],
  id,
});

const makeClient = (id: string) => ({
  id,
  client: {
    getInfo: vi.fn(() => makeClientInfo(id)),
  },
});

const DB_SERVER = {
  id: "mcp-1",
  userId: "user-1",
  name: "My MCP",
  visibility: "private",
  config: { type: "stdio", command: "node", args: [] },
  lastConnectionStatus: "connected",
};

beforeEach(() => {
  vi.clearAllMocks();
  mcpClientsManagerMock.refreshClient.mockResolvedValue(undefined);
});

describe("GET /api/mcp/list", () => {
  it("returns 401 when no current user", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("returns 401 when current user has no id", async () => {
    getCurrentUserMock.mockResolvedValue({});
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns servers list when authorized", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([DB_SERVER]);
    mcpClientsManagerMock.getClients.mockResolvedValue([makeClient("mcp-1")]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("mcp-1");
  });

  it("includes config for owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([DB_SERVER]);
    mcpClientsManagerMock.getClients.mockResolvedValue([makeClient("mcp-1")]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].config).toBeDefined();
  });

  it("hides config for non-owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-2" });
    const sharedServer = { ...DB_SERVER, userId: "user-1" };
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([sharedServer]);
    mcpClientsManagerMock.getClients.mockResolvedValue([makeClient("mcp-1")]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].config).toBeUndefined();
  });

  it("uses status from memory client when available", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([DB_SERVER]);
    const client = makeClient("mcp-1");
    client.client.getInfo = vi.fn(() => ({
      enabled: true,
      status: "connected",
      error: undefined,
      toolInfo: [],
      id: "mcp-1",
    }));
    mcpClientsManagerMock.getClients.mockResolvedValue([client]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].status).toBe("connected");
  });

  it("uses 'disconnected' status when server not in memory", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([DB_SERVER]);
    mcpClientsManagerMock.getClients.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body[0].status).toBe("disconnected");
  });

  it("calls refreshClient for servers not yet in memory", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([DB_SERVER]);
    mcpClientsManagerMock.getClients.mockResolvedValue([]);
    await GET();
    expect(mcpClientsManagerMock.refreshClient).toHaveBeenCalledWith("mcp-1");
  });

  it("does not call refreshClient for servers already in memory", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([DB_SERVER]);
    mcpClientsManagerMock.getClients.mockResolvedValue([makeClient("mcp-1")]);
    await GET();
    expect(mcpClientsManagerMock.refreshClient).not.toHaveBeenCalled();
  });

  it("calls selectAllForUser with current user id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-99" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([]);
    mcpClientsManagerMock.getClients.mockResolvedValue([]);
    await GET();
    expect(mcpRepositoryMock.selectAllForUser).toHaveBeenCalledWith("user-99");
  });

  it("returns empty array when no servers exist", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    mcpRepositoryMock.selectAllForUser.mockResolvedValue([]);
    mcpClientsManagerMock.getClients.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
