import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  selectStructureByIdMock,
  saveStructureMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectStructureByIdMock: vi.fn(),
  saveStructureMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    checkAccess: checkAccessMock,
    selectStructureById: selectStructureByIdMock,
    saveStructure: saveStructureMock,
  },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/workflow/[id]/structure", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns workflow structure when access granted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    const STRUCTURE = { nodes: [{ id: "n-1" }], edges: [] };
    selectStructureByIdMock.mockResolvedValueOnce(STRUCTURE);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toHaveLength(1);
  });
});

describe("POST /api/workflow/[id]/structure", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("saves structure and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    saveStructureMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [{ id: "n-1" }], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(saveStructureMock).toHaveBeenCalled();
  });

  it("returns 401 when user has no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("never calls saveStructure when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(saveStructureMock).not.toHaveBeenCalled();
  });

  it("never calls saveStructure when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(saveStructureMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflow/[id]/structure — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls selectStructureById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("never calls selectStructureById when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("returns structure with edges when present", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    const STRUCTURE = { nodes: [{ id: "n-1" }, { id: "n-2" }], edges: [{ id: "e-1" }] };
    selectStructureByIdMock.mockResolvedValueOnce(STRUCTURE);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.edges).toHaveLength(1);
  });
});
