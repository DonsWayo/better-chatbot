import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getCurrentUserMock,
  selectAllForUserMock,
  getClientsMock,
  refreshClientMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  selectAllForUserMock: vi.fn(),
  getClientsMock: vi.fn(),
  refreshClientMock: vi.fn(),
}));

vi.mock("lib/auth/permissions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("lib/db/repository", () => ({
  mcpRepository: { selectAllForUser: selectAllForUserMock },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    getClients: getClientsMock,
    refreshClient: refreshClientMock,
  },
}));

const SERVER = { id: "mcp-1", name: "My MCP", userId: "u1", config: { url: "http://mcp" }, lastConnectionStatus: "ok" };

describe("GET /api/mcp/list", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no servers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([]);
    getClientsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns server list with status info", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([SERVER]);
    getClientsMock.mockResolvedValueOnce([
      {
        id: "mcp-1",
        client: {
          getInfo: () => ({ id: "mcp-1", enabled: true, status: "connected", toolInfo: [] }),
        },
      },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].status).toBe("connected");
    expect(body[0].config).toBeDefined(); // owner sees config
  });

  it("hides config from non-owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u2", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([SERVER]);
    getClientsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].config).toBeUndefined(); // non-owner config hidden
  });

  it("never calls selectAllForUser when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllForUserMock).not.toHaveBeenCalled();
  });

  it("server without in-memory client shows disconnected status", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([SERVER]);
    getClientsMock.mockResolvedValueOnce([]); // no in-memory client
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].status).toBe("disconnected");
  });

  it("triggers refreshClient for server not yet in memory", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([SERVER]);
    getClientsMock.mockResolvedValueOnce([]); // server not in memory → should trigger refresh
    refreshClientMock.mockResolvedValue(undefined);
    const { GET } = await import("./route");
    await GET();
    expect(refreshClientMock).toHaveBeenCalledWith(SERVER.id);
  });

  it("includes toolInfo from in-memory client", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([SERVER]);
    const toolInfo = [{ name: "search", description: "Search the web" }];
    getClientsMock.mockResolvedValueOnce([
      {
        id: "mcp-1",
        client: {
          getInfo: () => ({ id: "mcp-1", enabled: true, status: "connected", toolInfo }),
        },
      },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].toolInfo).toEqual(toolInfo);
  });
});

describe("GET /api/mcp/list — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body has error field", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("getCurrentUser called exactly once", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });

  it("never calls getClients when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getClientsMock).not.toHaveBeenCalled();
  });

  it("200 body is an array", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([]);
    getClientsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("server object has status and toolInfo properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    selectAllForUserMock.mockResolvedValueOnce([SERVER]);
    getClientsMock.mockResolvedValueOnce([
      {
        id: "mcp-1",
        client: {
          getInfo: () => ({ id: "mcp-1", enabled: true, status: "connected", toolInfo: [] }),
        },
      },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0]).toHaveProperty("status");
    expect(body[0]).toHaveProperty("toolInfo");
  });

  it("never calls selectAllForUser when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllForUserMock).not.toHaveBeenCalled();
  });
});
