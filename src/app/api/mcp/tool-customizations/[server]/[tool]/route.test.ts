import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  mcpMcpToolCustomizationRepositoryMock,
  serverCacheMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  mcpMcpToolCustomizationRepositoryMock: {
    select: vi.fn(),
    upsertToolCustomization: vi.fn(),
    deleteToolCustomization: vi.fn(),
  },
  serverCacheMock: { delete: vi.fn() },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpMcpToolCustomizationRepository: mcpMcpToolCustomizationRepositoryMock,
}));
vi.mock("lib/cache", () => ({ serverCache: serverCacheMock }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: {
    mcpServerCustomizations: (userId: string) => `mcp:server:${userId}`,
  },
}));

import { GET, POST, DELETE } from "./route";

const makeContext = (server: string, tool: string) => ({
  params: Promise.resolve({ server, tool }),
});

const makeRequest = (body: unknown, method = "POST") =>
  new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const TOOL_CUSTOMIZATION = {
  id: "tc-1",
  userId: "user-1",
  mcpServerId: "server-1",
  toolName: "my-tool",
  prompt: "Use carefully",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mcp/tool-customizations/[server]/[tool]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://x"),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(401);
  });

  it("returns tool customization when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.select.mockResolvedValue(
      TOOL_CUSTOMIZATION,
    );
    const res = await GET(
      new Request("http://x"),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.toolName).toBe("my-tool");
    expect(body.prompt).toBe("Use carefully");
  });

  it("returns empty object when customization is null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.select.mockResolvedValue(null);
    const res = await GET(
      new Request("http://x"),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("calls select with server id, tool name, and user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    mcpMcpToolCustomizationRepositoryMock.select.mockResolvedValue(null);
    await GET(new Request("http://x"), makeContext("server-abc", "some-tool"));
    expect(mcpMcpToolCustomizationRepositoryMock.select).toHaveBeenCalledWith({
      mcpServerId: "server-abc",
      toolName: "some-tool",
      userId: "user-42",
    });
  });
});

describe("POST /api/mcp/tool-customizations/[server]/[tool]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ prompt: "Be careful" }),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(401);
  });

  it("upserts and returns tool customization when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.upsertToolCustomization.mockResolvedValue(
      TOOL_CUSTOMIZATION,
    );
    const res = await POST(
      makeRequest({ prompt: "Use carefully" }),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.toolName).toBe("my-tool");
  });

  it("calls upsertToolCustomization with server id, tool name, and userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-session" } });
    mcpMcpToolCustomizationRepositoryMock.upsertToolCustomization.mockResolvedValue(
      TOOL_CUSTOMIZATION,
    );
    await POST(
      makeRequest({ prompt: "Test" }),
      makeContext("server-42", "tool-xyz"),
    );
    expect(
      mcpMcpToolCustomizationRepositoryMock.upsertToolCustomization,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-session",
        mcpServerId: "server-42",
        toolName: "tool-xyz",
      }),
    );
  });

  it("invalidates cache after upsert", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.upsertToolCustomization.mockResolvedValue(
      TOOL_CUSTOMIZATION,
    );
    await POST(makeRequest({ prompt: "Test" }), makeContext("server-1", "tool-1"));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("mcp:server:user-1");
  });
});

describe("DELETE /api/mcp/tool-customizations/[server]/[tool]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://x"),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(401);
  });

  it("deletes and returns success when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.deleteToolCustomization.mockResolvedValue(
      undefined,
    );
    const res = await DELETE(
      new Request("http://x"),
      makeContext("server-1", "my-tool"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls deleteToolCustomization with server id, tool name, and user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    mcpMcpToolCustomizationRepositoryMock.deleteToolCustomization.mockResolvedValue(
      undefined,
    );
    await DELETE(new Request("http://x"), makeContext("server-abc", "tool-xyz"));
    expect(
      mcpMcpToolCustomizationRepositoryMock.deleteToolCustomization,
    ).toHaveBeenCalledWith({
      mcpServerId: "server-abc",
      toolName: "tool-xyz",
      userId: "user-42",
    });
  });

  it("invalidates cache after deletion", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.deleteToolCustomization.mockResolvedValue(
      undefined,
    );
    await DELETE(new Request("http://x"), makeContext("server-1", "tool-1"));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("mcp:server:user-1");
  });
});
