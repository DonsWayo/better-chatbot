import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  selectByUserIdAndMcpServerIdMock,
  upsertMock,
  deleteMcpServerCustomizationMock,
  serverCacheDeleteMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectByUserIdAndMcpServerIdMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteMcpServerCustomizationMock: vi.fn(),
  serverCacheDeleteMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpServerCustomizationRepository: {
    selectByUserIdAndMcpServerId: selectByUserIdAndMcpServerIdMock,
    upsertMcpServerCustomization: upsertMock,
    deleteMcpServerCustomization: deleteMcpServerCustomizationMock,
  },
}));
vi.mock("lib/cache", () => ({ serverCache: { delete: serverCacheDeleteMock } }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { mcpServerCustomizations: (id: string) => `mcp-custom:${id}` },
}));
vi.mock("app-types/mcp", () => ({
  McpServerCustomizationZodSchema: { parse: (b: unknown) => b },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/mcp/server-customizations/[server]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns empty object when no customization found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns customization when found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const CUSTOM = { mcpServerId: "srv-1", prompt: "Be concise" };
    selectByUserIdAndMcpServerIdMock.mockResolvedValueOnce(CUSTOM);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe("Be concise");
  });
});

describe("POST /api/mcp/server-customizations/[server]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ prompt: "Be helpful" }), { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(401);
  });

  it("upserts customization and invalidates cache", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const RESULT = { mcpServerId: "srv-1", userId: "u1", prompt: "Be brief" };
    upsertMock.mockResolvedValueOnce(RESULT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ prompt: "Be brief" }), { params: Promise.resolve({ server: "srv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe("Be brief");
    expect(serverCacheDeleteMock).toHaveBeenCalled();
  });
});
