import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateApiKeyMock,
  hasScopeMock,
  principalCanCreateAgentMock,
  selectAgentsMock,
  insertAgentMock,
} = vi.hoisted(() => ({
  authenticateApiKeyMock: vi.fn(),
  hasScopeMock: vi.fn(),
  principalCanCreateAgentMock: vi.fn(),
  selectAgentsMock: vi.fn(),
  insertAgentMock: vi.fn(),
}));

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
  principalCanCreateAgent: principalCanCreateAgentMock,
}));
vi.mock("lib/db/repository", () => ({
  agentRepository: {
    selectAgents: selectAgentsMock,
    insertAgent: insertAgentMock,
  },
}));

import { GET, POST } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  principalCanCreateAgentMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
});

function getReq(auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/agents", {
    headers: { authorization: auth },
  });
}
function postReq(body: unknown): Request {
  return new Request("https://x/api/v1/agents", {
    method: "POST",
    headers: {
      authorization: "Bearer ck_live_x",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/agents", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("lists agents visible to the principal", async () => {
    selectAgentsMock.mockResolvedValueOnce([
      {
        id: "a1",
        name: "Helper",
        description: "d",
        visibility: "private",
        userId: "u1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.agents).toHaveLength(1);
    expect(selectAgentsMock).toHaveBeenCalledWith("u1", ["all"], 100);
  });
});

describe("POST /api/v1/agents", () => {
  it("403 when the principal's role cannot create agents", async () => {
    principalCanCreateAgentMock.mockReturnValue(false);
    const res = await POST(postReq({ name: "X", instructions: {} }));
    expect(res.status).toBe(403);
    expect(insertAgentMock).not.toHaveBeenCalled();
  });

  it("400 on an invalid body", async () => {
    const res = await POST(postReq({ instructions: {} })); // missing name
    expect(res.status).toBe(400);
  });

  it("creates an agent owned by the principal", async () => {
    insertAgentMock.mockResolvedValueOnce({
      id: "a1",
      name: "X",
      description: null,
      visibility: "private",
      userId: "u1",
      createdAt: new Date(),
    });
    const res = await POST(
      postReq({
        name: "X",
        instructions: { systemPrompt: "hi" },
        userId: "ATTACKER",
      }),
    );
    expect(res.status).toBe(201);
    // userId is forced to the principal, never the client-supplied value.
    expect(insertAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
    );
  });
});
