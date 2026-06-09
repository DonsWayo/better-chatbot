import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  checkAccessMock,
  selectByIdMock,
  saveMock,
  deleteMock,
  canEditWorkflowMock,
  canDeleteWorkflowMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectByIdMock: vi.fn(),
  saveMock: vi.fn(),
  deleteMock: vi.fn(),
  canEditWorkflowMock: vi.fn(),
  canDeleteWorkflowMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    checkAccess: checkAccessMock,
    selectById: selectByIdMock,
    save: saveMock,
    delete: deleteMock,
  },
}));
vi.mock("lib/auth/permissions", () => ({
  canEditWorkflow: canEditWorkflowMock,
  canDeleteWorkflow: canDeleteWorkflowMock,
}));

const WORKFLOW = { id: "wf-1", name: "My Workflow", visibility: "private", isPublished: false };

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/workflow/[id]", () => {
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

  it("returns workflow when access granted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce(WORKFLOW);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("wf-1");
  });
});

describe("PUT /api/workflow/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ isPublished: true }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ isPublished: true }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(403);
  });

  it("updates workflow visibility", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce(WORKFLOW);
    const UPDATED = { ...WORKFLOW, isPublished: true };
    saveMock.mockResolvedValueOnce(UPDATED);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ isPublished: true }), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isPublished).toBe(true);
  });
});

describe("DELETE /api/workflow/[id]", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking delete permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes workflow and returns success message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    deleteMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("deleted");
    expect(deleteMock).toHaveBeenCalledWith("wf-1");
  });
});
