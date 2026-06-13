import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateApiKeyMock, hasScopeMock, runWorkflowSessionMock } =
  vi.hoisted(() => ({
    authenticateApiKeyMock: vi.fn(),
    hasScopeMock: vi.fn(),
    runWorkflowSessionMock: vi.fn(),
  }));

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("../_lib/run-session", () => ({
  runWorkflowSession: runWorkflowSessionMock,
}));

import { POST } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

function post(body: unknown, auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/sessions", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
});

describe("POST /api/v1/sessions", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await POST(post({ workflowId: "w1" }));
    expect(res.status).toBe(401);
    expect(runWorkflowSessionMock).not.toHaveBeenCalled();
  });

  it("403 when the key lacks sessions:write scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const res = await POST(post({ workflowId: "w1" }));
    expect(res.status).toBe(403);
  });

  it("400 when workflowId is missing", async () => {
    const res = await POST(post({ input: {} }));
    expect(res.status).toBe(400);
  });

  it("400 rejecting agentId-only runs", async () => {
    const res = await POST(post({ agentId: "a1" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_request");
  });

  it("202 with the session id on the happy path", async () => {
    runWorkflowSessionMock.mockResolvedValueOnce({
      ok: true,
      sessionId: "s1",
      status: "queued",
    });
    const res = await POST(post({ workflowId: "w1", input: { query: "hi" } }));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({ sessionId: "s1", status: "queued" });
    expect(runWorkflowSessionMock).toHaveBeenCalledWith({
      principal: PRINCIPAL,
      workflowId: "w1",
      input: { query: "hi" },
    });
  });

  it("403 when the principal cannot access the workflow (ownership denied)", async () => {
    runWorkflowSessionMock.mockResolvedValueOnce({
      ok: false,
      code: "forbidden",
      message: "Not allowed to run this workflow",
    });
    const res = await POST(post({ workflowId: "w1" }));
    expect(res.status).toBe(403);
  });

  it("402 when the team budget is exhausted", async () => {
    runWorkflowSessionMock.mockResolvedValueOnce({
      ok: false,
      code: "budget_exhausted",
      message: "Team budget exhausted",
    });
    const res = await POST(post({ workflowId: "w1" }));
    expect(res.status).toBe(402);
  });
});
