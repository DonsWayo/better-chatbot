import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getSessionWithStepsMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getSessionWithStepsMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/agent-platform/sessions", () => ({
  getSessionWithSteps: getSessionWithStepsMock,
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const REQ = new Request("http://localhost/api/runs/run-1");

const RUN = {
  session: { id: "run-1", userId: "owner-1", status: "running" },
  steps: [{ id: "st-1", stepIndex: 0, status: "completed" }],
};

describe("GET /api/runs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("run-1"));
    expect(res.status).toBe(401);
  });

  it("never calls getSessionWithSteps when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(REQ, params("run-1"));
    expect(getSessionWithStepsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the run does not exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    getSessionWithStepsMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 200 for the owner", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "owner-1", role: "user" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("run-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toBe("run-1");
    expect(body.steps).toHaveLength(1);
  });

  it("returns 403 for a non-owner non-admin", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "intruder", role: "user" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("run-1"));
    expect(res.status).toBe(403);
  });

  it("returns 200 for an admin who is not the owner", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("run-1"));
    expect(res.status).toBe(200);
  });

  it("supports comma-separated roles containing admin", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "admin-2", role: "editor,admin" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("run-1"));
    expect(res.status).toBe(200);
  });

  it("passes the route param id to getSessionWithSteps", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    await GET(REQ, params("run-xyz"));
    expect(getSessionWithStepsMock).toHaveBeenCalledWith("run-xyz");
  });

  it("200 response has JSON content-type", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    const res = await GET(REQ, params("run-1"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("calls getSessionWithSteps exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { GET } = await import("./route");
    await GET(REQ, params("run-1"));
    expect(getSessionWithStepsMock).toHaveBeenCalledTimes(1);
  });
});
