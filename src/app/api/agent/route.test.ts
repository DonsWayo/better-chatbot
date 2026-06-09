import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  agentRepositoryMock,
  canCreateAgentMock,
  serverCacheMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  agentRepositoryMock: {
    selectAgents: vi.fn(),
    insertAgent: vi.fn(),
  },
  canCreateAgentMock: vi.fn(),
  serverCacheMock: { delete: vi.fn() },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ agentRepository: agentRepositoryMock }));
vi.mock("lib/auth/permissions", () => ({ canCreateAgent: canCreateAgentMock }));
vi.mock("lib/cache", () => ({ serverCache: serverCacheMock }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { agentInstructions: (id: string) => `agent:${id}` },
}));

import { GET, POST } from "./route";

const makeGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL("http://localhost/api/agent");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
};

const makePostRequest = (body: unknown) =>
  new Request("http://localhost/api/agent", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const VALID_AGENT_BODY = {
  name: "Test Agent",
  userId: "user-1",
  instructions: {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/agent", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns agents for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    agentRepositoryMock.selectAgents.mockResolvedValue([{ id: "ag-1" }]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("calls selectAgents with userId and default filter", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    agentRepositoryMock.selectAgents.mockResolvedValue([]);
    await GET(makeGetRequest());
    expect(agentRepositoryMock.selectAgents).toHaveBeenCalledWith(
      "user-99",
      expect.any(Array),
      expect.any(Number),
    );
  });

  it("parses filters from query string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    agentRepositoryMock.selectAgents.mockResolvedValue([]);
    await GET(makeGetRequest({ filters: "mine,shared" }));
    expect(agentRepositoryMock.selectAgents).toHaveBeenCalledWith(
      "user-1",
      ["mine", "shared"],
      expect.any(Number),
    );
  });

  it("returns 400 on invalid query params", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await GET(makeGetRequest({ limit: "999" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 on repository error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    agentRepositoryMock.selectAgents.mockRejectedValue(new Error("DB fail"));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/agent", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makePostRequest(VALID_AGENT_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot create agents", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateAgentMock.mockResolvedValue(false);
    const res = await POST(makePostRequest(VALID_AGENT_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid body (missing name)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateAgentMock.mockResolvedValue(true);
    const res = await POST(
      makePostRequest({ userId: "user-1", instructions: {} }),
    );
    expect(res.status).toBe(400);
  });

  it("creates and returns agent when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateAgentMock.mockResolvedValue(true);
    const agent = { id: "ag-1", name: "Test Agent", userId: "user-1" };
    agentRepositoryMock.insertAgent.mockResolvedValue(agent);
    const res = await POST(makePostRequest(VALID_AGENT_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ag-1");
  });

  it("calls insertAgent with userId from session (not request body)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-session" } });
    canCreateAgentMock.mockResolvedValue(true);
    agentRepositoryMock.insertAgent.mockResolvedValue({ id: "ag-1" });
    await POST(makePostRequest({ ...VALID_AGENT_BODY, userId: "user-from-body" }));
    expect(agentRepositoryMock.insertAgent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-session" }),
    );
  });

  it("invalidates cache after creation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateAgentMock.mockResolvedValue(true);
    agentRepositoryMock.insertAgent.mockResolvedValue({ id: "ag-new" });
    await POST(makePostRequest(VALID_AGENT_BODY));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("agent:ag-new");
  });

  it("does not call canCreateAgent when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makePostRequest(VALID_AGENT_BODY));
    expect(canCreateAgentMock).not.toHaveBeenCalled();
  });

  it("returns JSON content-type on 403", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateAgentMock.mockResolvedValue(false);
    const res = await POST(makePostRequest(VALID_AGENT_BODY));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("GET /api/agent — extra coverage", () => {
  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET(makeGetRequest());
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
