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
});
