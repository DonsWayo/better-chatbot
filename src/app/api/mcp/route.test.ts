import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  canCreateMCPMock,
  saveMcpClientActionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  canCreateMCPMock: vi.fn(),
  saveMcpClientActionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/auth/permissions", () => ({ canCreateMCP: canCreateMCPMock }));
vi.mock("./actions", () => ({ saveMcpClientAction: saveMcpClientActionMock }));
vi.mock("lib/db/pg/schema.pg", () => ({ McpServerTable: {} }));
vi.mock("better-auth", () => ({ logger: { error: vi.fn() } }));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("POST /api/mcp", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My MCP", url: "http://mcp" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MCP creation permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My MCP", url: "http://mcp" }));
    expect(res.status).toBe(403);
  });

  it("creates MCP server and returns its id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      client: { getInfo: () => ({ id: "mcp-new" }) },
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My MCP", url: "http://mcp" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe("mcp-new");
  });
});
