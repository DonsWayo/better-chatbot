import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  selectAgentByIdMock,
  updateAgentMock,
  deleteAgentMock,
  canEditAgentMock,
  canDeleteAgentMock,
  serverCacheDeleteMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectAgentByIdMock: vi.fn(),
  updateAgentMock: vi.fn(),
  deleteAgentMock: vi.fn(),
  canEditAgentMock: vi.fn(),
  canDeleteAgentMock: vi.fn(),
  serverCacheDeleteMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    checkAccess: checkAccessMock,
    selectAgentById: selectAgentByIdMock,
    updateAgent: updateAgentMock,
    deleteAgent: deleteAgentMock,
  },
}));
vi.mock("lib/auth/permissions", () => ({
  canEditAgent: canEditAgentMock,
  canDeleteAgent: canDeleteAgentMock,
}));
vi.mock("lib/cache", () => ({ serverCache: { delete: serverCacheDeleteMock } }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { agentInstructions: (id: string) => `agent:${id}` },
}));
vi.mock("app-types/agent", () => ({
  AgentUpdateSchema: { parse: (b: unknown) => b },
}));

const AGENT = { id: "ag-1", name: "Test Agent", userId: "u1", visibility: "private" };

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/agent/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns agent when access granted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ag-1");
  });
});

describe("PUT /api/agent/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "Renamed" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditAgentMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "Renamed" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(403);
  });

  it("updates agent and returns updated record", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditAgentMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    const UPDATED = { ...AGENT, name: "Renamed" };
    updateAgentMock.mockResolvedValueOnce(UPDATED);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "Renamed" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Renamed");
  });
});

describe("DELETE /api/agent/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking delete permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteAgentMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes agent and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteAgentMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    deleteAgentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(serverCacheDeleteMock).toHaveBeenCalledWith("agent:ag-1");
  });
});
