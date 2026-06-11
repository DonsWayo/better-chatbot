import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns workflow structure when access granted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    const STRUCTURE = { nodes: [{ id: "n-1" }], edges: [] };
    selectStructureByIdMock.mockResolvedValueOnce(STRUCTURE);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toHaveLength(1);
  });
});

describe("POST /api/workflow/[id]/structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("saves structure and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    saveStructureMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        nodes: [{ id: "n-1" }],
        edges: [],
        deleteNodes: [],
        deleteEdges: [],
      }),
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
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("never calls saveStructure when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(saveStructureMock).not.toHaveBeenCalled();
  });

  it("never calls saveStructure when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(saveStructureMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflow/[id]/structure — guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    const STRUCTURE = {
      nodes: [{ id: "n-1" }, { id: "n-2" }],
      edges: [{ id: "e-1" }],
    };
    selectStructureByIdMock.mockResolvedValueOnce(STRUCTURE);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.edges).toHaveLength(1);
  });
});

describe("GET /api/workflow/[id]/structure — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("selectStructureById called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce({ nodes: [], edges: [] });
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has both nodes and edges properties", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce({
      nodes: [],
      edges: [],
      id: "wf-1",
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const body = await res.json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
  });

  it("never calls checkAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/workflow/[id]/structure — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(await res.text()).toBe("Unauthorized");
  });

  it("saveStructure called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    saveStructureMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        nodes: [{ id: "n-1" }],
        edges: [],
        deleteNodes: [],
        deleteEdges: [],
      }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(saveStructureMock).toHaveBeenCalledTimes(1);
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls checkAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      {
        params: Promise.resolve({ id: "wf-1" }),
      },
    );
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it("200 body success is strictly true", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    saveStructureMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("POST /api/workflow/[id]/structure — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Response instance for 401 (unauthenticated)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 401 (no access)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res).toBeInstanceOf(Response);
  });

  it("saveStructure called exactly once on successful POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    saveStructureMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(saveStructureMock).toHaveBeenCalledTimes(1);
  });

  it("checkAccess called exactly once on authenticated POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    saveStructureMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(checkAccessMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST and GET /api/workflow/[id]/structure — guard invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("saveStructure not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(saveStructureMock).not.toHaveBeenCalled();
  });

  it("GET selectStructureById not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("POST returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ nodes: [], edges: [], deleteNodes: [], deleteEdges: [] }),
      { params: Promise.resolve({ id: "wf-1" }) },
    );
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
