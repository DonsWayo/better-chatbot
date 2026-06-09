import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  workflowRepositoryMock,
  canEditWorkflowMock,
  canDeleteWorkflowMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  workflowRepositoryMock: {
    checkAccess: vi.fn(),
    selectById: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
  canEditWorkflowMock: vi.fn(),
  canDeleteWorkflowMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: workflowRepositoryMock,
}));
vi.mock("lib/auth/permissions", () => ({
  canEditWorkflow: canEditWorkflowMock,
  canDeleteWorkflow: canDeleteWorkflowMock,
}));

import { GET, PUT, DELETE } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown, method = "PUT") =>
  new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const WORKFLOW = {
  id: "wf-1",
  name: "My Workflow",
  userId: "user-1",
  visibility: "private",
  isPublished: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workflow/[id]", () => {
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

  it("returns workflow when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectById.mockResolvedValue(WORKFLOW);
    const res = await GET(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("wf-1");
  });

  it("calls checkAccess with id and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectById.mockResolvedValue(WORKFLOW);
    await GET(new Request("http://x"), makeContext("wf-abc"));
    expect(workflowRepositoryMock.checkAccess).toHaveBeenCalledWith("wf-abc", "user-99");
  });
});

describe("PUT /api/workflow/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PUT(makeRequest({ visibility: "public" }), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot edit workflows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(false);
    const res = await PUT(makeRequest({ visibility: "public" }), makeContext("wf-1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when user lacks access to specific workflow", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await PUT(makeRequest({ visibility: "public" }), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when workflow not found after access check", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectById.mockResolvedValue(null);
    const res = await PUT(makeRequest({ visibility: "public" }), makeContext("wf-1"));
    expect(res.status).toBe(404);
  });

  it("updates and returns workflow when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.selectById.mockResolvedValue(WORKFLOW);
    const updated = { ...WORKFLOW, visibility: "public" };
    workflowRepositoryMock.save.mockResolvedValue(updated);
    const res = await PUT(makeRequest({ visibility: "public" }), makeContext("wf-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visibility).toBe("public");
  });
});

describe("DELETE /api/workflow/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot delete workflows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteWorkflowMock.mockResolvedValue(false);
    const res = await DELETE(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when user lacks access to specific workflow", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await DELETE(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(401);
  });

  it("deletes and returns message when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.delete.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x"), makeContext("wf-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/deleted/i);
  });

  it("calls delete with the workflow id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.delete.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("wf-xyz"));
    expect(workflowRepositoryMock.delete).toHaveBeenCalledWith("wf-xyz");
  });
});
