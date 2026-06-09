import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  selectMock,
  upsertToolCustomizationMock,
  serverCacheDeleteMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectMock: vi.fn(),
  upsertToolCustomizationMock: vi.fn(),
  serverCacheDeleteMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpMcpToolCustomizationRepository: {
    select: selectMock,
    upsertToolCustomization: upsertToolCustomizationMock,
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
});
