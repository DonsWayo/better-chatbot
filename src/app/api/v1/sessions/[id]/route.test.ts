import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateApiKeyMock, hasScopeMock, getSessionMock } = vi.hoisted(
  () => ({
    authenticateApiKeyMock: vi.fn(),
    hasScopeMock: vi.fn(),
    getSessionMock: vi.fn(),
  }),
);

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/agent-platform/sessions", () => ({
  getSession: getSessionMock,
}));

import { GET } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "user",
  keyId: "k1",
  scopes: ["*"],
};

function get(auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/sessions/s1", {
    headers: { authorization: auth },
  });
}
const params = Promise.resolve({ id: "s1" });

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
});

describe("GET /api/v1/sessions/[id]", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(get(), { params });
    expect(res.status).toBe(401);
  });

  it("returns the status snapshot for an owned session", async () => {
    getSessionMock.mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      status: "running",
      costSoFar: 0.01,
      startedAt: null,
      endedAt: null,
      error: null,
    });
    const res = await GET(get(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessionId).toBe("s1");
    expect(json.status).toBe("running");
  });

  it("404 (not leaking existence) for a session owned by someone else", async () => {
    getSessionMock.mockResolvedValueOnce({
      id: "s1",
      userId: "OTHER",
      status: "running",
    });
    const res = await GET(get(), { params });
    expect(res.status).toBe(404);
  });

  it("404 for a missing session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const res = await GET(get(), { params });
    expect(res.status).toBe(404);
  });
});
