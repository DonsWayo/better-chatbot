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

  it("never calls canCreateMCP when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "My MCP" }));
    expect(canCreateMCPMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks MCP creation permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "My MCP", url: "http://mcp" }));
    expect(res.status).toBe(403);
  });

  it("never calls saveMcpClientAction when forbidden", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "My MCP" }));
    expect(saveMcpClientActionMock).not.toHaveBeenCalled();
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

  it("calls saveMcpClientAction with request body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    const serverPayload = { name: "my-mcp", config: { url: "http://mcp.example.com" } };
    saveMcpClientActionMock.mockResolvedValueOnce({
      client: { getInfo: () => ({ id: "srv-1" }) },
    });
    const { POST } = await import("./route");
    await POST(makeRequest(serverPayload));
    expect(saveMcpClientActionMock).toHaveBeenCalledWith(serverPayload);
  });

  it("returns 500 when saveMcpClientAction throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockRejectedValueOnce(new Error("validation error"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "bad-mcp" }));
    expect(res.status).toBe(500);
  });

  it("error body has message field on 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockRejectedValueOnce(new Error("duplicate name"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "dup" }));
    const body = await res.json();
    expect(body).toHaveProperty("message");
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("saveMcpClientAction called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      client: { getInfo: () => ({ id: "srv-ok" }) },
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "new-mcp" }));
    expect(saveMcpClientActionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls saveMcpClientAction when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(saveMcpClientActionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/mcp — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("canCreateMCP called exactly once when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({}));
    expect(canCreateMCPMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has success:true and id on creation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      client: { getInfo: () => ({ id: "mcp-success" }) },
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "test-mcp" }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe("mcp-success");
  });
});
