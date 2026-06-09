import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  selectStructureByIdMock,
  createWorkflowExecutorMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectStructureByIdMock: vi.fn(),
  createWorkflowExecutorMock: vi.fn(() => ({
    subscribe: vi.fn(),
    run: vi.fn(),
  })),
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
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("lib/utils", () => ({ safeJSONParse: vi.fn(), toAny: (v: unknown) => v }));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body), signal: new AbortController().signal } as unknown as Request;
}

describe("POST /api/workflow/[id]/execute", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "hello" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "hello" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when workflow structure not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "hello" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("never calls selectStructureById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "hello" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("never calls selectStructureById when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "hello" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectStructureByIdMock).not.toHaveBeenCalled();
  });

  it("401 body text is 'Unauthorized' when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("404 body text indicates not found when structure missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-missing" }) });
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
    const res = await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("404 body text is not empty when structure missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "missing" }) });
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("checkAccess called with userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "session-user-99" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(checkAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      "session-user-99",
    );
  });

  it("checkAccess called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(checkAccessMock).toHaveBeenCalledTimes(1);
  });

  it("selectStructureById called with the route id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-route-id" }) });
    expect(selectStructureByIdMock).toHaveBeenCalledWith("wf-route-id");
  });

  it("getSession called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/workflow/[id]/execute — executor guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never creates executor when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });

  it("never creates executor when access is denied", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(createWorkflowExecutorMock).not.toHaveBeenCalled();
  });

  it("never creates executor when structure not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-missing" }) });
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
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance for 401 (no auth)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 404 (not found)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectStructureByIdMock.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "missing" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("getSession called exactly once per POST (response shape)", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ query: "x" }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("checkAccess called with the correct id from route params", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({}), { params: Promise.resolve({ id: "specific-wf-id" }) });
    expect(checkAccessMock).toHaveBeenCalledWith("specific-wf-id", expect.anything());
  });
});
