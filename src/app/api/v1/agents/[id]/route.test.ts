import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateApiKeyMock, hasScopeMock, selectAgentByIdMock } =
  vi.hoisted(() => ({
    authenticateApiKeyMock: vi.fn(),
    hasScopeMock: vi.fn(),
    selectAgentByIdMock: vi.fn(),
  }));

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    selectAgentById: selectAgentByIdMock,
  },
}));

import { GET } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

const params = Promise.resolve({ id: "a1" });

function getReq(auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/agents/a1", {
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
});

describe("GET /api/v1/agents/[id]", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(401);
  });

  it("403 when the key lacks agents:read scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toContain("agents:read");
  });

  it("404 when the agent is not found or not visible", async () => {
    selectAgentByIdMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not_found");
  });

  it("404 silently for an agent owned by another user (no existence leak)", async () => {
    // Repository's selectAgentById already enforces own-or-visible, returns null
    selectAgentByIdMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
    // Confirm repo was queried with the principal's userId for scope enforcement
    expect(selectAgentByIdMock).toHaveBeenCalledWith("a1", "u1");
  });

  it("200 with full agent fields on the happy path", async () => {
    const now = new Date();
    selectAgentByIdMock.mockResolvedValueOnce({
      id: "a1",
      name: "My Agent",
      description: "An agent",
      icon: { type: "emoji", value: "🤖" },
      instructions: { systemPrompt: "Be helpful" },
      visibility: "private",
      userId: "u1",
      createdAt: now,
      updatedAt: now,
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      id: "a1",
      name: "My Agent",
      description: "An agent",
      visibility: "private",
      userId: "u1",
    });
    expect(json.instructions).toMatchObject({ systemPrompt: "Be helpful" });
  });

  it("200 with null description and null icon when absent", async () => {
    const now = new Date();
    selectAgentByIdMock.mockResolvedValueOnce({
      id: "a1",
      name: "Minimal Agent",
      description: null,
      icon: null,
      instructions: {},
      visibility: "team",
      userId: "u1",
      createdAt: now,
      updatedAt: now,
    });
    const res = await GET(getReq(), { params });
    const json = await res.json();
    expect(json.description).toBeNull();
    expect(json.icon).toBeNull();
  });

  it("200 for a shared agent visible to another principal (different userId)", async () => {
    // A different user's agent that is shared — repo returns it; route exposes it
    const otherPrincipal = { ...PRINCIPAL, userId: "u2" };
    authenticateApiKeyMock.mockResolvedValueOnce(otherPrincipal);
    const now = new Date();
    selectAgentByIdMock.mockResolvedValueOnce({
      id: "a1",
      name: "Shared Agent",
      description: null,
      icon: null,
      instructions: {},
      visibility: "shared",
      userId: "u1", // owned by u1 but visible to u2
      createdAt: now,
      updatedAt: now,
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    // Scoped to the requesting principal (u2)
    expect(selectAgentByIdMock).toHaveBeenCalledWith("a1", "u2");
  });
});
