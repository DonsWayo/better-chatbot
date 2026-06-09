import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

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
vi.mock("./actions", () => ({
  saveMcpClientAction: saveMcpClientActionMock,
}));
vi.mock("lib/db/pg/schema.pg", () => ({ McpServerTable: {} }));
vi.mock("better-auth", () => ({ logger: { error: vi.fn() } }));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/mcp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const MCP_BODY = {
  name: "My MCP",
  config: { type: "stdio", command: "node", args: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/mcp", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot create MCP connections", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(false);
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/permission/i);
  });

  it("creates MCP and returns success with id when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "mcp-new" }) },
    });
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe("mcp-new");
  });

  it("calls saveMcpClientAction with parsed body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "mcp-1" }) },
    });
    await POST(makeRequest(MCP_BODY));
    expect(saveMcpClientActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My MCP" }),
    );
  });

  it("returns 500 when saveMcpClientAction throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockRejectedValue(new Error("Connection failed"));
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Connection failed");
  });

  it("calls canCreateMCP before saveMcpClientAction", async () => {
    const callOrder: string[] = [];
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockImplementation(async () => { callOrder.push("canCreate"); return true; });
    saveMcpClientActionMock.mockImplementation(async () => { callOrder.push("save"); return { client: { getInfo: () => ({ id: "x" }) } }; });
    await POST(makeRequest(MCP_BODY));
    expect(callOrder[0]).toBe("canCreate");
    expect(callOrder[1]).toBe("save");
  });

  it("does not call saveMcpClientAction when canCreateMCP returns false", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(false);
    await POST(makeRequest(MCP_BODY));
    expect(saveMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("returns success=true in body when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "mcp-abc" }) },
    });
    const res = await POST(makeRequest(MCP_BODY));
    const body = await res.json();
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("id", "mcp-abc");
  });

  it("500 message falls back when error has no message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockRejectedValue({});
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Failed to save MCP client");
  });

  it("calls canCreateMCP exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "x" }) },
    });
    await POST(makeRequest(MCP_BODY));
    expect(canCreateMCPMock).toHaveBeenCalledTimes(1);
  });

  it("does not call canCreateMCP when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest(MCP_BODY));
    expect(canCreateMCPMock).not.toHaveBeenCalled();
  });

  it("calls saveMcpClientAction exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "x" }) },
    });
    await POST(makeRequest(MCP_BODY));
    expect(saveMcpClientActionMock).toHaveBeenCalledTimes(1);
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "x" }) },
    });
    await POST(makeRequest(MCP_BODY));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateMCPMock.mockResolvedValue(true);
    saveMcpClientActionMock.mockResolvedValue({
      client: { getInfo: () => ({ id: "x" }) },
    });
    const res = await POST(makeRequest(MCP_BODY));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not call saveMcpClientAction when session user has no id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    await POST(makeRequest(MCP_BODY));
    expect(saveMcpClientActionMock).not.toHaveBeenCalled();
  });
});
