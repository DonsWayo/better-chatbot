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
