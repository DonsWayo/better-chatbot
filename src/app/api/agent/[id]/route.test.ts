import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  agentRepositoryMock,
  canEditAgentMock,
  canDeleteAgentMock,
  serverCacheMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  agentRepositoryMock: {
    checkAccess: vi.fn(),
    selectAgentById: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
  },
  canEditAgentMock: vi.fn(),
  canDeleteAgentMock: vi.fn(),
  serverCacheMock: { delete: vi.fn() },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ agentRepository: agentRepositoryMock }));
vi.mock("lib/auth/permissions", () => ({
  canEditAgent: canEditAgentMock,
  canDeleteAgent: canDeleteAgentMock,
}));
vi.mock("lib/cache", () => ({ serverCache: serverCacheMock }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: { agentInstructions: (id: string) => `agent:${id}` },
}));

import { GET, PUT, DELETE } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });
const makeRequest = (body: unknown, method = "PUT") =>
  new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const AGENT = { id: "ag-1", name: "My Agent", userId: "user-1", visibility: "private" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/agent/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when user lacks access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    agentRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await GET(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(401);
  });

  it("returns agent when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.selectAgentById.mockResolvedValue(AGENT);
    const res = await GET(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ag-1");
  });

  it("calls checkAccess with id and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.selectAgentById.mockResolvedValue(AGENT);
    await GET(new Request("http://x"), makeContext("ag-xyz"));
    expect(agentRepositoryMock.checkAccess).toHaveBeenCalledWith("ag-xyz", "user-99");
  });
});

describe("PUT /api/agent/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PUT(makeRequest({ name: "Updated" }), makeContext("ag-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot edit agents", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditAgentMock.mockResolvedValue(false);
    const res = await PUT(makeRequest({ name: "Updated" }), makeContext("ag-1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when user lacks access to specific agent", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await PUT(makeRequest({ name: "Updated" }), makeContext("ag-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (name too long)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.selectAgentById.mockResolvedValue(AGENT);
    const res = await PUT(
      makeRequest({ name: "x".repeat(101) }),
      makeContext("ag-1"),
    );
    expect(res.status).toBe(400);
  });

  it("updates and returns agent when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.selectAgentById.mockResolvedValue(AGENT);
    const updated = { ...AGENT, name: "Updated Name" };
    agentRepositoryMock.updateAgent.mockResolvedValue(updated);
    const res = await PUT(makeRequest({ name: "Updated Name" }), makeContext("ag-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");
  });

  it("invalidates cache after update", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canEditAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.selectAgentById.mockResolvedValue(AGENT);
    agentRepositoryMock.updateAgent.mockResolvedValue({ ...AGENT, id: "ag-1" });
    await PUT(makeRequest({ name: "Updated" }), makeContext("ag-1"));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("agent:ag-1");
  });
});

describe("DELETE /api/agent/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot delete agents", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteAgentMock.mockResolvedValue(false);
    const res = await DELETE(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when user lacks access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(false);
    const res = await DELETE(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(401);
  });

  it("deletes agent and returns success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.deleteAgent.mockResolvedValue(undefined);
    const res = await DELETE(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls deleteAgent with id and userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    canDeleteAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.deleteAgent.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("ag-abc"));
    expect(agentRepositoryMock.deleteAgent).toHaveBeenCalledWith("ag-abc", "user-42");
  });

  it("invalidates cache after deletion", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockResolvedValue(true);
    agentRepositoryMock.deleteAgent.mockResolvedValue(undefined);
    await DELETE(new Request("http://x"), makeContext("ag-1"));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("agent:ag-1");
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canDeleteAgentMock.mockResolvedValue(true);
    agentRepositoryMock.checkAccess.mockRejectedValue(new Error("DB fail"));
    const res = await DELETE(new Request("http://x"), makeContext("ag-1"));
    expect(res.status).toBe(500);
  });
});
