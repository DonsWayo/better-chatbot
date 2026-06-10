import { beforeEach, describe, expect, it, vi } from "vitest";

// Agent Platform #19 — revision pinning in the workflow execute route.
// When a published revision exists, the run must pin its id on the agent
// session AND execute from the frozen snapshot (nodes/edges) instead of the
// live tables; any resolution failure must fall back to the live structure.

const {
  getSessionMock,
  checkAccessMock,
  selectStructureByIdMock,
  createWorkflowExecutorMock,
  createAgentSessionMock,
  attachSessionPersistenceMock,
  markSessionAwaitingApprovalMock,
  resolveRunnableRevisionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectStructureByIdMock: vi.fn(),
  createWorkflowExecutorMock: vi.fn(() => ({
    subscribe: vi.fn(),
    run: vi.fn().mockResolvedValue({ isOk: true }),
  })),
  createAgentSessionMock: vi.fn().mockResolvedValue({ id: "agent-session-1" }),
  attachSessionPersistenceMock: vi.fn(() => () => {}),
  markSessionAwaitingApprovalMock: vi.fn().mockResolvedValue(undefined),
  resolveRunnableRevisionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    checkAccess: checkAccessMock,
    selectStructureById: selectStructureByIdMock,
  },
}));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: createWorkflowExecutorMock,
}));
vi.mock("lib/ai/workflow/shared.workflow", () => ({
  encodeWorkflowEvent: vi.fn(() => "data"),
}));
vi.mock("lib/agent-platform/sessions", () => ({
  createSession: createAgentSessionMock,
}));
vi.mock("lib/agent-platform/persistent-executor", () => ({
  attachSessionPersistence: attachSessionPersistenceMock,
}));
vi.mock("lib/agent-platform/approvals", () => ({
  markSessionAwaitingApproval: markSessionAwaitingApprovalMock,
}));
vi.mock("lib/agent-platform/revisions", () => ({
  resolveRunnableRevision: resolveRunnableRevisionMock,
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("lib/utils", () => ({
  safeJSONParse: vi.fn(),
  toAny: (v: unknown) => v,
}));

function makeRequest(body?: unknown): Request {
  return {
    json: () => Promise.resolve(body),
    signal: new AbortController().signal,
  } as unknown as Request;
}

const liveNodes = [{ id: "live-n1" }];
const liveEdges = [{ id: "live-e1" }];
const snapNodes = [{ id: "snap-n1" }, { id: "snap-n2" }];
const snapEdges = [{ id: "snap-e1" }];

function setupAuthedWorkflow() {
  getSessionMock.mockResolvedValue({ user: { id: "u1" } });
  checkAccessMock.mockResolvedValue(true);
  selectStructureByIdMock.mockResolvedValue({
    name: "wf",
    nodes: liveNodes,
    edges: liveEdges,
  });
}

describe("POST /api/workflow/[id]/execute — revision pinning (#19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAgentSessionMock.mockResolvedValue({ id: "agent-session-1" });
    createWorkflowExecutorMock.mockReturnValue({
      subscribe: vi.fn(),
      run: vi.fn().mockResolvedValue({ isOk: true }),
    });
  });

  it("pins the published revision id on the created agent session", async () => {
    setupAuthedWorkflow();
    resolveRunnableRevisionMock.mockResolvedValue({
      id: "rev-7",
      configSnapshot: { workflow: {}, nodes: snapNodes, edges: snapEdges },
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(resolveRunnableRevisionMock).toHaveBeenCalledWith(
      "workflow",
      "wf-1",
    );
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: "rev-7" }),
    );
  });

  it("executes from the SNAPSHOT structure when a published revision exists", async () => {
    setupAuthedWorkflow();
    resolveRunnableRevisionMock.mockResolvedValue({
      id: "rev-7",
      configSnapshot: { workflow: {}, nodes: snapNodes, edges: snapEdges },
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: snapNodes, edges: snapEdges }),
    );
  });

  it("uses the live structure with a null revisionId when nothing is published", async () => {
    setupAuthedWorkflow();
    resolveRunnableRevisionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: liveNodes, edges: liveEdges }),
    );
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: null }),
    );
  });

  it("falls back to the live structure when revision resolution throws — run still works", async () => {
    setupAuthedWorkflow();
    resolveRunnableRevisionMock.mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: liveNodes, edges: liveEdges }),
    );
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: null }),
    );
  });

  it("ignores a malformed snapshot (missing arrays) and runs the live structure unpinned", async () => {
    setupAuthedWorkflow();
    resolveRunnableRevisionMock.mockResolvedValue({
      id: "rev-bad",
      configSnapshot: { workflow: {} },
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: liveNodes, edges: liveEdges }),
    );
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ revisionId: null }),
    );
  });

  it("does not resolve revisions for unauthenticated requests", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(resolveRunnableRevisionMock).not.toHaveBeenCalled();
  });

  it("revision resolution failure does not prevent session creation (definitionId preserved)", async () => {
    setupAuthedWorkflow();
    resolveRunnableRevisionMock.mockRejectedValue(new Error("boom"));
    const { POST } = await import("./route");
    await POST(makeRequest({ query: { q: 1 } }), {
      params: Promise.resolve({ id: "wf-9" }),
    });
    expect(createAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "workflow",
        definitionId: "wf-9",
        userId: "u1",
      }),
    );
  });
});
