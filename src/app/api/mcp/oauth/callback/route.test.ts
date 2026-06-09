import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionByStateMock, getClientMock, refreshClientMock, finishAuthMock } = vi.hoisted(() => ({
  getSessionByStateMock: vi.fn(),
  getClientMock: vi.fn(),
  refreshClientMock: vi.fn(),
  finishAuthMock: vi.fn(),
}));

vi.mock("@/lib/db/repository", () => ({
  mcpOAuthRepository: { getSessionByState: getSessionByStateMock },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    getClient: getClientMock,
    refreshClient: refreshClientMock,
  },
}));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));

function makeRequest(params: Record<string, string>): any {
  const url = new URL("http://localhost/api/mcp/oauth/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { url: url.toString() };
}

describe("GET /api/mcp/oauth/callback", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 400 HTML when error param present", async () => {
    const { GET } = await import("./route");
    const req = makeRequest({ error: "access_denied", error_description: "User rejected" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Authentication Failed");
    expect(text).toContain("MCP_OAUTH_ERROR");
  });

  it("returns 400 HTML when code or state missing", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ code: "abc" })); // missing state
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Missing required parameters");
  });

  it("returns 400 HTML when session not found in DB", async () => {
    getSessionByStateMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ code: "abc123", state: "xyz" }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("Invalid or expired session");
  });

  it("returns 200 HTML on successful OAuth completion", async () => {
    getSessionByStateMock.mockResolvedValueOnce({ mcpServerId: "mcp-1" });
    getClientMock.mockResolvedValueOnce({
      client: { finishAuth: finishAuthMock },
    });
    finishAuthMock.mockResolvedValueOnce(undefined);
    refreshClientMock.mockResolvedValueOnce(undefined);

    const { GET } = await import("./route");
    const res = await GET(makeRequest({ code: "auth-code", state: "state-val" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Authentication Successful");
    expect(text).toContain("MCP_OAUTH_SUCCESS");
  });

  it("returns 500 HTML when finishAuth throws", async () => {
    getSessionByStateMock.mockResolvedValueOnce({ mcpServerId: "mcp-2" });
    getClientMock.mockResolvedValueOnce({
      client: { finishAuth: finishAuthMock },
    });
    finishAuthMock.mockRejectedValueOnce(new Error("token exchange failed"));

    const { GET } = await import("./route");
    const res = await GET(makeRequest({ code: "bad-code", state: "state-val" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("Authentication Failed");
  });
});

describe("GET /api/mcp/oauth/callback — guard chains", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls getSessionByState when error param present", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ error: "access_denied" }));
    expect(getSessionByStateMock).not.toHaveBeenCalled();
  });

  it("never calls getSessionByState when code is missing", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ state: "xyz" }));
    expect(getSessionByStateMock).not.toHaveBeenCalled();
  });

  it("never calls getSessionByState when state is missing", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest({ code: "abc" }));
    expect(getSessionByStateMock).not.toHaveBeenCalled();
  });

  it("never calls finishAuth when session not found", async () => {
    getSessionByStateMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    await GET(makeRequest({ code: "abc123", state: "xyz" }));
    expect(finishAuthMock).not.toHaveBeenCalled();
  });

  it("never calls refreshClient when finishAuth throws", async () => {
    getSessionByStateMock.mockResolvedValueOnce({ mcpServerId: "mcp-2" });
    getClientMock.mockResolvedValueOnce({ client: { finishAuth: finishAuthMock } });
    finishAuthMock.mockRejectedValueOnce(new Error("token exchange failed"));
    const { GET } = await import("./route");
    await GET(makeRequest({ code: "bad-code", state: "state-val" }));
    expect(refreshClientMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/mcp/oauth/callback — HTML content", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("success HTML contains window.close()", async () => {
    getSessionByStateMock.mockResolvedValueOnce({ mcpServerId: "mcp-1" });
    getClientMock.mockResolvedValueOnce({ client: { finishAuth: finishAuthMock } });
    finishAuthMock.mockResolvedValueOnce(undefined);
    refreshClientMock.mockResolvedValueOnce(undefined);
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ code: "auth-code", state: "state-val" }));
    const text = await res.text();
    expect(text).toContain("window.close()");
  });

  it("error HTML also contains window.close()", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ error: "access_denied" }));
    const text = await res.text();
    expect(text).toContain("window.close()");
  });

  it("success response has Content-Type text/html", async () => {
    getSessionByStateMock.mockResolvedValueOnce({ mcpServerId: "mcp-1" });
    getClientMock.mockResolvedValueOnce({ client: { finishAuth: finishAuthMock } });
    finishAuthMock.mockResolvedValueOnce(undefined);
    refreshClientMock.mockResolvedValueOnce(undefined);
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ code: "auth-code", state: "state-val" }));
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("error response has Content-Type text/html", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ error: "access_denied" }));
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });
});

describe("GET /api/mcp/oauth/callback — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSessionByState called exactly once per GET", async () => {
    getSessionByStateMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest({ state: "s1", code: "c1" }));
    expect(getSessionByStateMock).toHaveBeenCalledTimes(1);
  });

  it("GET returns a Response instance when session is null", async () => {
    getSessionByStateMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ state: "s1", code: "c1" }));
    expect(res).toBeInstanceOf(Response);
  });

  it("getClient not called when session not found", async () => {
    getSessionByStateMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest({ state: "s1", code: "c1" }));
    expect(getClientMock).not.toHaveBeenCalled();
  });

  it("finishAuth not called when session not found", async () => {
    getSessionByStateMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET(makeRequest({ state: "s1", code: "c1" }));
    expect(finishAuthMock).not.toHaveBeenCalled();
  });
});
