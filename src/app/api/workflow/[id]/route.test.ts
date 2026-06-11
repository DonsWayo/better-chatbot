import { beforeEach, describe, expect, it, vi } from "vitest";

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

const WORKFLOW = {
  id: "wf-1",
  name: "My Workflow",
  visibility: "private",
  isPublished: false,
};

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/workflow/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns workflow when access granted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce(WORKFLOW);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("wf-1");
  });

  it("401 body is plain text Unauthorized when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("never calls checkAccess when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it("never calls selectById when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectByIdMock).not.toHaveBeenCalled();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/workflow/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ isPublished: true }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking edit permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ isPublished: true }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
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
    const res = await PUT(makeRequest({ isPublished: true }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isPublished).toBe(true);
  });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls save when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    await PUT(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/workflow/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking delete permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes workflow and returns success message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    deleteMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("deleted");
    expect(deleteMock).toHaveBeenCalledWith("wf-1");
  });

  it("401 body is plain text Unauthorized", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(await res.text()).toBe("Unauthorized");
  });

  it("403 body has error field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls deleteMock when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("never calls deleteMock when lacking delete permission", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(false);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("deleteMock called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canDeleteWorkflowMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    deleteMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "wf-1" }) });
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/workflow/[id] — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("response is always a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce(WORKFLOW);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("PUT response is always a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("DELETE response is always a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });
});

describe("PUT /api/workflow/[id] — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 403 (no edit permission)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(false);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ name: "X" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("canEditWorkflow not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    await PUT(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(canEditWorkflowMock).not.toHaveBeenCalled();
  });

  it("saveMock called exactly once on successful PUT", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    canEditWorkflowMock.mockResolvedValueOnce(true);
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce(WORKFLOW);
    saveMock.mockResolvedValueOnce(WORKFLOW);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET, PUT, DELETE /api/workflow/[id] — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectById not called when GET unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(selectByIdMock).not.toHaveBeenCalled();
  });

  it("delete not called when DELETE unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest({}), { params: Promise.resolve({ id: "wf-1" }) });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("DELETE returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest({}), {
      params: Promise.resolve({ id: "wf-1" }),
    });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });
});
