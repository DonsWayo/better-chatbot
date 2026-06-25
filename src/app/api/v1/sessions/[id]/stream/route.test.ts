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
  return new Request("https://x/api/v1/sessions/s1/stream", {
    headers: { authorization: auth },
  });
}

function ownedSession(overrides = {}) {
  return {
    id: "s1",
    userId: "u1",
    status: "completed",
    costSoFar: 0.01,
    startedAt: new Date(),
    endedAt: new Date(),
    error: null,
    ...overrides,
  };
}

/** Collect SSE events from the streaming response into an array of {event, data} */
async function collectEvents(
  res: Response,
): Promise<Array<{ event: string; data: unknown }>> {
  const text = await res.text();
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = text.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    const eventLine = lines.find((l) => l.startsWith("event: "));
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (eventLine && dataLine) {
      events.push({
        event: eventLine.replace("event: ", ""),
        data: JSON.parse(dataLine.replace("data: ", "")),
      });
    }
  }
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
  getSessionMock.mockResolvedValue(ownedSession());
});

describe("GET /api/v1/sessions/[id]/stream", () => {
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

  it("404 for a session owned by another user", async () => {
    getSessionMock.mockResolvedValueOnce({ id: "s1", userId: "OTHER" });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("404 for a missing session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("streams Content-Type: text/event-stream for an owned session", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "completed" }),
      steps: [],
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("includes Cache-Control: no-cache and Connection: keep-alive headers", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "completed" }),
      steps: [],
    });
    const res = await GET(getReq(), { params });
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
  });

  it("emits a status event then a done event for a completed session", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "completed", costSoFar: 0.02 }),
      steps: [],
    });
    const res = await GET(getReq(), { params });
    const events = await collectEvents(res);
    const statusEvent = events.find((e) => e.event === "status");
    const doneEvent = events.find((e) => e.event === "done");
    expect(statusEvent).toBeTruthy();
    expect((statusEvent!.data as { status: string }).status).toBe("completed");
    expect(doneEvent).toBeTruthy();
    expect((doneEvent!.data as { status: string }).status).toBe("completed");
  });

  it("emits a step event when steps are present", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "completed" }),
      steps: [
        {
          stepIndex: 0,
          nodeId: "n1",
          nodeKind: "llm",
          status: "completed",
          costUsd: 0.005,
        },
      ],
    });
    const res = await GET(getReq(), { params });
    const events = await collectEvents(res);
    const stepEvent = events.find((e) => e.event === "step");
    expect(stepEvent).toBeTruthy();
    expect((stepEvent!.data as { nodeId: string }).nodeId).toBe("n1");
  });

  it("emits done with awaiting_approval status for a parked session", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce({
      session: ownedSession({ status: "awaiting_approval" }),
      steps: [],
    });
    const res = await GET(getReq(), { params });
    const events = await collectEvents(res);
    const doneEvent = events.find((e) => e.event === "done");
    expect(doneEvent).toBeTruthy();
    expect((doneEvent!.data as { status: string }).status).toBe(
      "awaiting_approval",
    );
  });

  it("emits an error event when getSessionWithSteps returns null mid-stream", async () => {
    getSessionWithStepsMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    const events = await collectEvents(res);
    const errEvent = events.find((e) => e.event === "error");
    expect(errEvent).toBeTruthy();
    expect((errEvent!.data as { code: string }).code).toBe("not_found");
  });
});
