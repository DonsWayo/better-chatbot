import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  selectMock,
  upsertToolCustomizationMock,
  deleteToolCustomizationMock,
  serverCacheDeleteMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectMock: vi.fn(),
  upsertToolCustomizationMock: vi.fn(),
  deleteToolCustomizationMock: vi.fn(),
  serverCacheDeleteMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpMcpToolCustomizationRepository: {
    select: selectMock,
    upsertToolCustomization: upsertToolCustomizationMock,
    deleteToolCustomization: deleteToolCustomizationMock,
  },
}));
vi.mock("lib/cache", () => ({ serverCache: { delete: serverCacheDeleteMock } }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { mcpServerCustomizations: (id: string) => `mcp-custom:${id}` },
}));
vi.mock("app-types/mcp", () => ({
  McpToolCustomizationZodSchema: { parse: (b: unknown) => b },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/mcp/tool-customizations/[server]/[tool]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(res.status).toBe(401);
  });

  it("returns empty object when no customization found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns customization data when found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const custom = { mcpServerId: "srv-1", toolName: "search", prompt: "Be thorough" };
    selectMock.mockResolvedValueOnce(custom);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe("Be thorough");
  });

  it("never calls select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("401 text body is Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("select called exactly once per authenticated GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("select called with server, tool, and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc" } });
    selectMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    await GET({} as Request, { params: Promise.resolve({ server: "my-server", tool: "my-tool" }) });
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcpServerId: "my-server", toolName: "my-tool", userId: "user-abc" }),
    );
  });
});

describe("POST /api/mcp/tool-customizations/[server]/[tool]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ prompt: "Be careful" }), {
      params: Promise.resolve({ server: "srv-1", tool: "search" }),
    });
    expect(res.status).toBe(401);
  });

  it("upserts tool customization and invalidates cache", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const RESULT = { mcpServerId: "srv-1", toolName: "search", prompt: "Search thoroughly" };
    upsertToolCustomizationMock.mockResolvedValueOnce(RESULT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ prompt: "Search thoroughly" }), {
      params: Promise.resolve({ server: "srv-1", tool: "search" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe("Search thoroughly");
    expect(serverCacheDeleteMock).toHaveBeenCalled();
  });

  it("never calls upsert when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ prompt: "x" }), {
      params: Promise.resolve({ server: "srv-1", tool: "search" }),
    });
    expect(upsertToolCustomizationMock).not.toHaveBeenCalled();
  });

  it("never invalidates cache when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ prompt: "x" }), {
      params: Promise.resolve({ server: "srv-1", tool: "search" }),
    });
    expect(serverCacheDeleteMock).not.toHaveBeenCalled();
  });

  it("401 text body is Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ prompt: "x" }), {
      params: Promise.resolve({ server: "srv-1", tool: "search" }),
    });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("upsert called exactly once per authenticated POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    upsertToolCustomizationMock.mockResolvedValueOnce({ mcpServerId: "srv-1", toolName: "t", prompt: "p" });
    const { POST } = await import("./route");
    await POST(makeRequest({ prompt: "p" }), {
      params: Promise.resolve({ server: "srv-1", tool: "t" }),
    });
    expect(upsertToolCustomizationMock).toHaveBeenCalledTimes(1);
  });

  it("cache key uses userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz" } });
    upsertToolCustomizationMock.mockResolvedValueOnce({ mcpServerId: "srv-1", toolName: "t", prompt: "p" });
    const { POST } = await import("./route");
    await POST(makeRequest({ prompt: "p" }), {
      params: Promise.resolve({ server: "srv-1", tool: "t" }),
    });
    expect(serverCacheDeleteMock).toHaveBeenCalledWith(
      expect.stringContaining("user-xyz"),
    );
  });
});

describe("DELETE /api/mcp/tool-customizations/[server]/[tool]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 with success:true for authenticated delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    deleteToolCustomizationMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("never calls deleteToolCustomization when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(deleteToolCustomizationMock).not.toHaveBeenCalled();
  });

  it("invalidates cache on successful delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    deleteToolCustomizationMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(serverCacheDeleteMock).toHaveBeenCalled();
  });

  it("never invalidates cache when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE({} as Request, { params: Promise.resolve({ server: "srv-1", tool: "search" }) });
    expect(serverCacheDeleteMock).not.toHaveBeenCalled();
  });

  it("deleteToolCustomization called with server, tool, and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "del-user" } });
    deleteToolCustomizationMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE({} as Request, { params: Promise.resolve({ server: "del-srv", tool: "del-tool" }) });
    expect(deleteToolCustomizationMock).toHaveBeenCalledWith(
      expect.objectContaining({ mcpServerId: "del-srv", toolName: "del-tool", userId: "del-user" }),
    );
  });
});
