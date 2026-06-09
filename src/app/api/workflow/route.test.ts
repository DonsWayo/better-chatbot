import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  selectAllMock,
  saveMock,
  checkAccessMock,
  canCreateWorkflowMock,
  canEditWorkflowMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectAllMock: vi.fn(),
  saveMock: vi.fn(),
  checkAccessMock: vi.fn(),
  canCreateWorkflowMock: vi.fn(),
  canEditWorkflowMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectAll: selectAllMock,
    save: saveMock,
    checkAccess: checkAccessMock,
  },
}));
vi.mock("lib/auth/permissions", () => ({
  canCreateWorkflow: canCreateWorkflowMock,
  canEditWorkflow: canEditWorkflowMock,
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/workflow", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns empty array when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns workflows for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const WORKFLOWS = [{ id: "wf-1", name: "My Workflow" }];
    selectAllMock.mockResolvedValueOnce(WORKFLOWS);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("never calls selectAll when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllMock).not.toHaveBeenCalled();
  });

  it("response body is always an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectAllMock.mockResolvedValueOnce([{ id: "wf-x" }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("passes userId to selectAll", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc-123" } });
    selectAllMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllMock).toHaveBeenCalledWith("user-abc-123");
  });
});

describe("POST /api/workflow (create)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "New Workflow" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks workflow creation permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "New Workflow" }));
    expect(res.status).toBe(403);
  });

  it("creates workflow and returns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateWorkflowMock.mockResolvedValueOnce(true);
    const WF = { id: "wf-new", name: "New Workflow" };
    saveMock.mockResolvedValueOnce(WF);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "New Workflow" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("wf-new");
  });

  it("never calls save when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "New Workflow" }));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("never calls save when user lacks creation permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "New Workflow" }));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("401 body is text 'Unauthorized'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "New Workflow" }));
    const text = await res.text();
    expect(text).toBe("Unauthorized");
  });
});

describe("POST /api/workflow (edit existing)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 403 when user lacks edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 when no access to existing workflow", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/workflow — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectAll called exactly once when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectAllMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllMock).toHaveBeenCalledTimes(1);
  });

  it("200 body is an array when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("POST /api/workflow (create) — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls canCreateWorkflow when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "New Workflow" }));
    expect(canCreateWorkflowMock).not.toHaveBeenCalled();
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "New Workflow" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "New Workflow" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("save called exactly once on successful create", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canCreateWorkflowMock.mockResolvedValueOnce(true);
    saveMock.mockResolvedValueOnce({ id: "wf-new", name: "New Workflow" });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "New Workflow" }));
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/workflow (edit existing) — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls save when user lacks edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("403 body has error field when lacking edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls checkAccess when user lacks edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { POST } = await import("./route");
    await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(checkAccessMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflow — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns a Response instance for unauthenticated request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for authenticated request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectAllMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectAllMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("selectAll called with userId for authenticated request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc" } });
    selectAllMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-abc" }));
  });
});

describe("GET and POST /api/workflow — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectAll not called when GET unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectAllMock).not.toHaveBeenCalled();
  });

  it("save not called when POST unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const req = { json: () => Promise.resolve({ name: "w", nodes: [], edges: [] }) } as unknown as Request;
    await POST(req);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("GET returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
