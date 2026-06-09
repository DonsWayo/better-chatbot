import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, workflowRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  workflowRepositoryMock: {
    checkAccess: vi.fn(),
    selectStructureById: vi.fn(),
    saveStructure: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: workflowRepositoryMock,
}));

import { GET, POST } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const STRUCTURE = {
  nodes: [{ id: "node-1", type: "agent" }],
  edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workflow/[id]/structure", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when user lacks access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await GET(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns structure when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(STRUCTURE);
    const res = await GET(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toHaveLength(1);
  });

  it("calls checkAccess with id and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(STRUCTURE);
    await GET(new Request("http://x"), makeContext("wf-abc"));
    expect(workflowRepositoryMock.checkAccess).toHaveBeenCalledWith(
      "wf-abc",
      "user-99",
    );
  });

  it("calls selectStructureById with workflow id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(STRUCTURE);
    await GET(new Request("http://x"), makeContext("wf-xyz"));
    expect(workflowRepositoryMock.selectStructureById).toHaveBeenCalledWith(
      "wf-xyz",
    );
  });
});

describe("POST /api/workflow/[id]/structure", () => {
  const STRUCTURE_BODY = {
    nodes: [{ id: "node-1", type: "agent" }],
    edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
    deleteNodes: [],
    deleteEdges: [],
  };

  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when user lacks access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("saves structure and returns success when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.saveStructure.mockResolvedValue(undefined);
    const res = await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls saveStructure with workflowId injected into nodes and edges", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.saveStructure.mockResolvedValue(undefined);
    await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-42"));
    expect(workflowRepositoryMock.saveStructure).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-42",
        nodes: expect.arrayContaining([
          expect.objectContaining({ workflowId: "wf-42" }),
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({ workflowId: "wf-42" }),
        ]),
      }),
    );
  });

  it("checks access with write mode (false) for POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.saveStructure.mockResolvedValue(undefined);
    await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(workflowRepositoryMock.checkAccess).toHaveBeenCalledWith(
      "wf-1",
      "user-1",
      false,
    );
  });

  it("does not call saveStructure when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(workflowRepositoryMock.saveStructure).not.toHaveBeenCalled();
  });

  it("getSession is called exactly once per POST request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.saveStructure.mockResolvedValue(undefined);
    await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("saveStructure is called exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.saveStructure.mockResolvedValue(undefined);
    await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(workflowRepositoryMock.saveStructure).toHaveBeenCalledTimes(1);
  });

  it("returns JSON content-type on POST success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.saveStructure.mockResolvedValue(undefined);
    const res = await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not call saveStructure when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest(STRUCTURE_BODY), makeContext("wf-1"));
    expect(workflowRepositoryMock.saveStructure).not.toHaveBeenCalled();
  });
});
