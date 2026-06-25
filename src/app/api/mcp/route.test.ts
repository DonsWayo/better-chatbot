import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, canCreateMCPMock, saveMcpClientActionMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    canCreateMCPMock: vi.fn(),
    saveMcpClientActionMock: vi.fn(),
  }));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/auth/permissions", () => ({ canCreateMCP: canCreateMCPMock }));
vi.mock("./actions", () => ({ saveMcpClientAction: saveMcpClientActionMock }));
vi.mock("lib/db/pg/schema.pg", () => ({ McpServerTable: {} }));
vi.mock("better-auth", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      success: true,
      id: "mcp-new",
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
    const serverPayload = {
      name: "my-mcp",
      config: { url: "http://mcp.example.com" },
    };
    saveMcpClientActionMock.mockResolvedValueOnce({
      success: true,
      id: "srv-1",
    });
    const { POST } = await import("./route");
    await POST(makeRequest(serverPayload));
    expect(saveMcpClientActionMock).toHaveBeenCalledWith(serverPayload);
  });

  it("returns 500 when saveMcpClientAction throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockRejectedValueOnce(
      new Error("validation error"),
    );
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

  it("does NOT leak the raw error on an unexpected 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockRejectedValueOnce(
      new Error("SSE error: TypeError: fetch failed: ECONNREFUSED ::1:19999"),
    );
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "bad" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).not.toMatch(/ECONNREFUSED|fetch failed|SSE error/i);
  });

  it("returns 422 (not 500) for an unreachable server (kind=connection)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      success: false,
      error:
        "Could not connect to the MCP server at that URL. Check the URL is reachable.",
      kind: "connection",
    });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        name: "bogus",
        config: { url: "http://localhost:19999/bogus" },
      }),
    );
    expect(res.status).toBe(422);
  });

  it("connection-error 422 body carries the clean message, no transport leak", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      success: false,
      error:
        "Could not connect to the MCP server at that URL. Check the URL is reachable.",
      kind: "connection",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "bogus" }));
    const body = await res.json();
    expect(body.message).toBe(
      "Could not connect to the MCP server at that URL. Check the URL is reachable.",
    );
    expect(body.message).not.toMatch(
      /ECONNREFUSED|fetch failed|SSE error|::1/i,
    );
  });

  it("maps a structured authorization failure to 403", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      success: false,
      error: "Only administrators can register org-wide MCP servers",
      kind: "other",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "org-mcp" }));
    expect(res.status).toBe(403);
  });

  it("maps a structured validation failure to 422", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      success: false,
      error: "A featured MCP server with this name already exists",
      kind: "other",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "dup" }));
    expect(res.status).toBe(422);
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
      success: true,
      id: "srv-ok",
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      success: true,
      id: "mcp-success",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "test-mcp" }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe("mcp-success");
  });
});

describe("POST /api/mcp — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 403", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 500", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockRejectedValueOnce(new Error("failed"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "bad" }));
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateMCPMock.mockResolvedValueOnce(true);
    saveMcpClientActionMock.mockResolvedValueOnce({
      success: true,
      id: "mcp-ok",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "new-mcp" }));
    expect(res).toBeInstanceOf(Response);
  });
});

describe("POST /api/mcp — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "mcp-1" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("saveMcpClientAction not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "mcp-1" }));
    expect(saveMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("canCreateMCP not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "mcp-1" }));
    expect(canCreateMCPMock).not.toHaveBeenCalled();
  });

  it("POST returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "mcp-1" }));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
