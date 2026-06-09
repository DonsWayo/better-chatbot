import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  workflowRepositoryMock,
  canCreateWorkflowMock,
  canEditWorkflowMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  workflowRepositoryMock: {
    selectAll: vi.fn(),
    save: vi.fn(),
    checkAccess: vi.fn(),
  },
  canCreateWorkflowMock: vi.fn(),
  canEditWorkflowMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: workflowRepositoryMock,
}));
vi.mock("lib/auth/permissions", () => ({
  canCreateWorkflow: canCreateWorkflowMock,
  canEditWorkflow: canEditWorkflowMock,
}));

import { GET, POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workflow", () => {
  it("returns empty array when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns workflows for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectAll.mockResolvedValue([{ id: "wf-1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("calls selectAll with the user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    workflowRepositoryMock.selectAll.mockResolvedValue([]);
    await GET();
    expect(workflowRepositoryMock.selectAll).toHaveBeenCalledWith("user-42");
  });
});

describe("POST /api/workflow — create new", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "My Workflow" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot create workflows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateWorkflowMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ name: "My Workflow" }));
    expect(res.status).toBe(403);
  });

  it("creates and returns workflow when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateWorkflowMock.mockResolvedValue(true);
    const wf = { id: "wf-1", name: "My Workflow", userId: "user-1" };
    workflowRepositoryMock.save.mockResolvedValue(wf);
    const res = await POST(makeRequest({ name: "My Workflow" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("wf-1");
  });

  it("calls save with userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    canCreateWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.save.mockResolvedValue({ id: "wf-1" });
    await POST(makeRequest({ name: "Test", description: "Desc" }));
    expect(workflowRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-99" }),
      undefined,
    );
  });
});

describe("POST /api/workflow — update existing", () => {
  it("returns 403 when user cannot edit workflows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 when user lacks access to specific workflow", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(res.status).toBe(401);
  });

  it("updates and returns workflow when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    const wf = { id: "wf-1", name: "Updated", userId: "user-1" };
    workflowRepositoryMock.save.mockResolvedValue(wf);
    const res = await POST(makeRequest({ id: "wf-1", name: "Updated" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });

  it("calls checkAccess with workflow id and user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    canEditWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.checkAccess.mockResolvedValue(true);
    workflowRepositoryMock.save.mockResolvedValue({ id: "wf-xyz" });
    await POST(makeRequest({ id: "wf-xyz", name: "Updated" }));
    expect(workflowRepositoryMock.checkAccess).toHaveBeenCalledWith(
      "wf-xyz",
      "user-42",
      false,
    );
  });
});

describe("GET /api/workflow — additional invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls selectAll exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectAll.mockResolvedValue([]);
    await GET();
    expect(workflowRepositoryMock.selectAll).toHaveBeenCalledTimes(1);
  });

  it("does not call selectAll when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET();
    expect(workflowRepositoryMock.selectAll).not.toHaveBeenCalled();
  });

  it("each workflow in response has an id field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectAll.mockResolvedValue([
      { id: "wf-a", name: "Workflow A" },
      { id: "wf-b", name: "Workflow B" },
    ]);
    const res = await GET();
    const body = await res.json();
    for (const wf of body) {
      expect(wf).toHaveProperty("id");
    }
  });
});

describe("POST /api/workflow — create invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call save when canCreateWorkflow returns false", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateWorkflowMock.mockResolvedValue(false);
    await POST(makeRequest({ name: "My Workflow" }));
    expect(workflowRepositoryMock.save).not.toHaveBeenCalled();
  });

  it("calls save exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateWorkflowMock.mockResolvedValue(true);
    workflowRepositoryMock.save.mockResolvedValue({ id: "wf-1" });
    await POST(makeRequest({ name: "My Workflow" }));
    expect(workflowRepositoryMock.save).toHaveBeenCalledTimes(1);
  });
});
