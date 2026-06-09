import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  selectStructureByIdMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectStructureByIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    checkAccess: checkAccessMock,
    selectStructureById: selectStructureByIdMock,
  },
}));
vi.mock("lib/ai/workflow/executor/workflow-executor", () => ({
  createWorkflowExecutor: vi.fn(() => ({
    subscribe: vi.fn(),
    run: vi.fn(),
  })),
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
});
