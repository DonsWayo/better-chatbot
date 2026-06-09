import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  selectAgentsMock,
  insertAgentMock,
  canCreateAgentMock,
  serverCacheDeleteMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectAgentsMock: vi.fn(),
  insertAgentMock: vi.fn(),
  canCreateAgentMock: vi.fn(),
  serverCacheDeleteMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    selectAgents: selectAgentsMock,
    insertAgent: insertAgentMock,
  },
}));
vi.mock("lib/auth/permissions", () => ({ canCreateAgent: canCreateAgentMock }));
vi.mock("lib/cache", () => ({ serverCache: { delete: serverCacheDeleteMock } }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { agentInstructions: (id: string) => `agent:${id}` },
}));
vi.mock("app-types/agent", () => ({
  AgentQuerySchema: {
    parse: (p: Record<string, string>) => ({
      type: p.type ?? "all",
      filters: p.filters,
      limit: p.limit ? Number(p.limit) : 20,
    }),
  },
  AgentCreateSchema: { parse: (b: unknown) => b },
}));

function makeRequest(url = "http://localhost/api/agent", body?: unknown): Request {
  return {
    url,
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

describe("GET /api/agent", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns agents list for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const AGENTS = [{ id: "ag-1", name: "My Agent" }];
    selectAgentsMock.mockResolvedValueOnce(AGENTS);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/agent", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks agent creation permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateAgentMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(res.status).toBe(403);
  });

  it("creates agent and returns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateAgentMock.mockResolvedValueOnce(true);
    const AGENT = { id: "ag-new", name: "New Agent", userId: "u1" };
    insertAgentMock.mockResolvedValueOnce(AGENT);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("http://localhost/api/agent", { name: "New Agent" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ag-new");
    expect(serverCacheDeleteMock).toHaveBeenCalledWith("agent:ag-new");
  });

  it("never calls insertAgent when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(insertAgentMock).not.toHaveBeenCalled();
  });

  it("never calls insertAgent when creation is forbidden", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateAgentMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(insertAgentMock).not.toHaveBeenCalled();
  });

  it("never invalidates cache when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(serverCacheDeleteMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/agent — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls selectAgents when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(selectAgentsMock).not.toHaveBeenCalled();
  });

  it("returns empty array body when user has no agents", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectAgentsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(await res.text()).toBe("Unauthorized");
  });

  it("selectAgents called exactly once for authenticated GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectAgentsMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(selectAgentsMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once for GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest());
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/agent — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(await res.text()).toBe("Unauthorized");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateAgentMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("getSession called exactly once for POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest("http://localhost/api/agent", { name: "Agent" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
