import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  selectStructureByIdMock,
  createWorkflowExecutorMock,
  createAgentSessionMock,
  attachSessionPersistenceMock,
  markSessionAwaitingApprovalMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectStructureByIdMock: vi.fn(),
  createWorkflowExecutorMock: vi.fn(() => ({
    subscribe: vi.fn(),
    run: vi.fn(),
  })),
  createAgentSessionMock: vi.fn().mockResolvedValue({ id: "agent-session-1" }),
  attachSessionPersistenceMock: vi.fn(() => () => {}),
  markSessionAwaitingApprovalMock: vi.fn().mockResolvedValue(undefined),
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

describe("POST /api/workflow/[id]/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "hello" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "hello" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when workflow structure not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "hello" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("never calls selectStructureById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "hello" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("never calls selectStructureById when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "hello" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("401 body text is 'Unauthorized' when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("404 body text indicates not found when structure missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "wf-missing" }),
    });
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("calls checkAccess with the workflow id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-xyz" }) });
    expect(checkAccessMock).toHaveBeenCalledWith(
      expect.stringContaining("wf-xyz"),
      expect.anything(),
    );
  });

  it("never calls checkAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it("401 text body is Unauthorized when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("404 body text is not empty when structure missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("checkAccess called with userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "session-user-99" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(checkAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      "session-user-99",
    );
  });

  it("checkAccess called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(checkAccessMock).toHaveBeenCalledTimes(1);
  });

  it("selectStructureById called with the route id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-route-id" }),
    });
    expect(selectStructureByIdMock).toHaveBeenCalledWith("wf-route-id");
  });

  it("getSession called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/workflow/[id]/execute — executor guard chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never creates executor when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });

  it("never creates executor when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });

  it("never creates executor when structure not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-missing" }),
    });
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });

  it("checkAccess not called for unauthenticated request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-99" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/workflow/[id]/execute — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("response is always a Response instance for 401 (no auth)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 404 (not found)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("getSession called exactly once per POST (response shape)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("checkAccess called with the correct id from route params", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({}), {
      params: Promise.resolve({ id: "specific-wf-id" }),
    });
    expect(checkAccessMock).toHaveBeenCalledWith(
      "specific-wf-id",
      expect.anything(),
    );
  });
});

describe("POST /api/workflow/[id]/execute — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("checkAccess never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it("selectStructureById never called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("createWorkflowExecutor never called when access denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/workflow/[id]/execute — approval gate (#24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupAuthedWorkflow() {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValue(true);
    selectStructureByIdMock.mockResolvedValue({
      name: "wf",
      nodes: [],
      edges: [],
    });
  }

  async function importApprovalPendingError() {
    const { ApprovalPendingError } = await import(
      "lib/agent-platform/approval-error"
    );
    return ApprovalPendingError;
  }

  it("passes the created agent session id into the workflow executor", async () => {
    setupAuthedWorkflow();
    createWorkflowExecutorMock.mockReturnValueOnce({
      subscribe: vi.fn(),
      run: vi.fn().mockResolvedValue({ isOk: true }),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentSessionId: "agent-session-1" }),
    );
    expect(attachSessionPersistenceMock).toHaveBeenCalledWith(
      expect.anything(),
      "agent-session-1",
    );
  });

  it("re-asserts awaiting_approval (session NOT failed) when the run halts with ApprovalPendingError", async () => {
    setupAuthedWorkflow();
    const ApprovalPendingError = await importApprovalPendingError();
    createWorkflowExecutorMock.mockReturnValueOnce({
      subscribe: vi.fn(),
      run: vi.fn().mockResolvedValue({
        isOk: false,
        error: new ApprovalPendingError("agent-session-1", "approval-1"),
      }),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markSessionAwaitingApprovalMock).toHaveBeenCalledWith(
      "agent-session-1",
    );
  });

  it("recognizes a serialized approval error by name (instanceof-free)", async () => {
    setupAuthedWorkflow();
    createWorkflowExecutorMock.mockReturnValueOnce({
      subscribe: vi.fn(),
      run: vi.fn().mockResolvedValue({
        isOk: false,
        error: { name: "ApprovalPendingError", message: "Approval pending" },
      }),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markSessionAwaitingApprovalMock).toHaveBeenCalledWith(
      "agent-session-1",
    );
  });

  it("does NOT mark awaiting_approval for ordinary run failures", async () => {
    setupAuthedWorkflow();
    createWorkflowExecutorMock.mockReturnValueOnce({
      subscribe: vi.fn(),
      run: vi.fn().mockResolvedValue({ isOk: false, error: new Error("boom") }),
    });
    const { POST } = await import("./route");
    await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markSessionAwaitingApprovalMock).not.toHaveBeenCalled();
  });

  it("still executes (without approval support) when agent session creation fails", async () => {
    setupAuthedWorkflow();
    createAgentSessionMock.mockRejectedValueOnce(new Error("db down"));
    createWorkflowExecutorMock.mockReturnValueOnce({
      subscribe: vi.fn(),
      run: vi.fn().mockResolvedValue({ isOk: true }),
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: {} }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    expect(createWorkflowExecutorMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentSessionId: undefined }),
    );
    expect(attachSessionPersistenceMock).not.toHaveBeenCalled();
  });
});
