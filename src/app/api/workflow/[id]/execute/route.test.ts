import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  workflowRepositoryMock,
  createWorkflowExecutorMock,
  encodeWorkflowEventMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  workflowRepositoryMock: {
    checkAccess: vi.fn(),
    selectStructureById: vi.fn(),
  },
  createWorkflowExecutorMock: vi.fn(),
  encodeWorkflowEventMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: workflowRepositoryMock,
}));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: createWorkflowExecutorMock,
}));
vi.mock("lib/ai/workflow/shared.workflow", () => ({
  encodeWorkflowEvent: encodeWorkflowEventMock,
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn() }),
    error: vi.fn(),
  },
}));
vi.mock("lib/utils", () => ({
  safeJSONParse: (v: unknown) => ({ value: String(v) }),
  toAny: (v: unknown) => v,
}));

import { POST } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const WORKFLOW = {
  id: "wf-1",
  name: "My Workflow",
  nodes: [{ id: "node-1" }],
  edges: [],
};

const makeExecutorMock = () => ({
  subscribe: vi.fn(),
  run: vi.fn().mockResolvedValue({ isOk: true }),
  exit: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  encodeWorkflowEventMock.mockReturnValue("event-data\n");
});

describe("POST /api/workflow/[id]/execute", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when user lacks access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when workflow not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(null);
    const res = await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(res.status).toBe(404);
  });

  it("returns a streaming response when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(WORKFLOW);
    const executor = makeExecutorMock();
    createWorkflowExecutorMock.mockReturnValue(executor);
    const res = await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("creates executor with workflow edges and nodes", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(WORKFLOW);
    const executor = makeExecutorMock();
    createWorkflowExecutorMock.mockReturnValue(executor);
    await POST(makeRequest({ query: "test run" }), makeContext("wf-1"));
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        edges: WORKFLOW.edges,
        nodes: WORKFLOW.nodes,
      }),
    );
  });

  it("checks access with the workflow id and user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    await POST(makeRequest({ query: "run" }), makeContext("wf-abc"));
    expect(workflowRepositoryMock.checkAccess).toHaveBeenCalledWith(
      "wf-abc",
      "user-42",
    );
  });

  it("calls selectStructureById with workflow id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(WORKFLOW);
    const executor = makeExecutorMock();
    createWorkflowExecutorMock.mockReturnValue(executor);
    await POST(makeRequest({ query: "run" }), makeContext("wf-special"));
    expect(workflowRepositoryMock.selectStructureById).toHaveBeenCalledWith("wf-special");
  });

  it("calls createWorkflowExecutor exactly once", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(WORKFLOW);
    const executor = makeExecutorMock();
    createWorkflowExecutorMock.mockReturnValue(executor);
    await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(createWorkflowExecutorMock).toHaveBeenCalledTimes(1);
  });

  it("does not create executor when workflow not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(null);
    await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });

  it("response has correct streaming content type", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(WORKFLOW);
    createWorkflowExecutorMock.mockReturnValue(makeExecutorMock());
    const res = await POST(makeRequest({ query: "hello" }), makeContext("wf-1"));
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("does not call checkAccess when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(workflowRepositoryMock.checkAccess).not.toHaveBeenCalled();
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectStructureById.mockResolvedValue(WORKFLOW);
    createWorkflowExecutorMock.mockReturnValue(makeExecutorMock());
    await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not call selectStructureById when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    await POST(makeRequest({ query: "run" }), makeContext("wf-1"));
    expect(workflowRepositoryMock.selectStructureById).not.toHaveBeenCalled();
  });
});
