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

  it("returns 403 when checkAccess passes but updateAgent matches no row", async () => {
    // A read-only grantee / team member passes the looser checkAccess() gate
    // but updateAgent's owner-or-org-wide WHERE matches nothing → null. The
    // route must answer 403, not 500 (the previous NPE on result.description).
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditAgentMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    updateAgentMock.mockResolvedValueOnce(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "Renamed" }), {
      params: Promise.resolve({ id: "ag-1" }),
    });
    expect(res.status).toBe(403);
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

describe("GET /api/agent/[id] — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("never calls checkAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it("never calls selectAgentById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(selectAgentByIdMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectAgentById called exactly once when access granted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(selectAgentByIdMock).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/agent/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "X" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditAgentMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "X" }), { params: Promise.resolve({ id: "ag-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls updateAgent when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ name: "X" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it("never calls updateAgent when lacking edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditAgentMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ name: "X" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it("serverCacheDelete called once on successful update", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditAgentMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    const UPDATED = { ...AGENT, name: "Renamed" };
    updateAgentMock.mockResolvedValueOnce(UPDATED);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ name: "Renamed" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(serverCacheDeleteMock).toHaveBeenCalledTimes(1);
    expect(serverCacheDeleteMock).toHaveBeenCalledWith("agent:ag-1");
  });

  it("getSession called exactly once per PUT", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ name: "X" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/agent/[id] — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteAgentMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls deleteAgent when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(deleteAgentMock).not.toHaveBeenCalled();
  });

  it("never calls deleteAgent when lacking delete permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteAgentMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(deleteAgentMock).not.toHaveBeenCalled();
  });

  it("deleteAgent called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteAgentMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    deleteAgentMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(deleteAgentMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/agent/[id] — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("selectAgentById called exactly once on authenticated GET", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectAgentByIdMock.mockResolvedValueOnce(AGENT);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(selectAgentByIdMock).toHaveBeenCalledTimes(1);
  });

  it("selectAgentById not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(selectAgentByIdMock).not.toHaveBeenCalled();
  });
});

describe("GET, PUT, DELETE /api/agent/[id] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("updateAgent not called when PUT unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ name: "x" }), { params: Promise.resolve({ id: "ag-1" }) });
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it("deleteAgent not called when DELETE unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(deleteAgentMock).not.toHaveBeenCalled();
  });

  it("DELETE returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "ag-1" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
