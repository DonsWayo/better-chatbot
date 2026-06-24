import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateApiKeyMock,
  hasScopeMock,
  getSessionMock,
  getSessionWithStepsMock,
} = vi.hoisted(() => ({
  authenticateApiKeyMock: vi.fn(),
  hasScopeMock: vi.fn(),
  getSessionMock: vi.fn(),
  getSessionWithStepsMock: vi.fn(),
}));

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/agent-platform/sessions", () => ({
  getSession: getSessionMock,
  getSessionWithSteps: getSessionWithStepsMock,
}));

import { GET } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "user",
  keyId: "k1",
  scopes: ["*"],
};

const params = Promise.resolve({ id: "s1" });

function getReq(auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/sessions/s1/transcript", {
    headers: { authorization: auth },
  });
}

function ownedSession(overrides = {}) {
  return {
    id: "s1",
    userId: "u1",
    status: "completed",
    costSoFar: 0.05,
    startedAt: new Date(),
    endedAt: new Date(),
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
  // loadOwnedSession calls getSession
  getSessionMock.mockResolvedValue(ownedSession());
});

describe("GET /api/v1/sessions/[id]/transcript", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(401);
  });

  it("403 when the key lacks sessions:read scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(403);
  });

  it("404 for a session owned by another user (no existence leak)", async () => {
    getSessionMock.mockResolvedValueOnce({ id: "s1", userId: "ATTACKER" });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("404 for a missing session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("404 when getSessionWithSteps returns null after ownership check passes", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("200 with empty steps array when session has no steps yet", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession(),
      steps: [],
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessionId).toBe("s1");
    expect(json.steps).toEqual([]);
  });

  it("200 with mapped step fields including output, cost and timing", async () => {
    const now = new Date();
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "completed" }),
      steps: [
        {
          stepIndex: 0,
          nodeId: "node-1",
          nodeKind: "llm",
          status: "completed",
          output: { text: "Hello" },
          error: null,
          costUsd: 0.003,
          startedAt: now,
          endedAt: now,
        },
        {
          stepIndex: 1,
          nodeId: "node-2",
          nodeKind: "tool",
          status: "completed",
          output: { result: "42" },
          error: null,
          costUsd: 0,
          startedAt: now,
          endedAt: now,
        },
      ],
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.steps).toHaveLength(2);
    expect(json.steps[0]).toMatchObject({
      stepIndex: 0,
      nodeId: "node-1",
      nodeKind: "llm",
      status: "completed",
      costUsd: 0.003,
    });
    expect(json.steps[0].output).toEqual({ text: "Hello" });
  });

  it("200 with failed session showing error on a step", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "failed", error: "Guardrail triggered" }),
      steps: [
        {
          stepIndex: 0,
          nodeId: "node-1",
          nodeKind: "llm",
          status: "failed",
          output: null,
          error: "content_violation",
          costUsd: 0,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      ],
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("failed");
    expect(json.steps[0].error).toBe("content_violation");
  });
});
