import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mcpOAuthRepositoryMock,
  mcpClientsManagerMock,
} = vi.hoisted(() => ({
  mcpOAuthRepositoryMock: {
    getSessionByState: vi.fn(),
  },
  mcpClientsManagerMock: {
    getClient: vi.fn(),
    refreshClient: vi.fn(),
  },
}));

vi.mock("@/lib/db/repository", () => ({
  mcpOAuthRepository: mcpOAuthRepositoryMock,
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: mcpClientsManagerMock,
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn() }),
    error: vi.fn(),
  },
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

const makeRequest = (params: Record<string, string>) => {
  const url = new URL("http://localhost/api/mcp/oauth/callback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
};

const OAUTH_SESSION = { mcpServerId: "server-1" };

const makeClient = () => ({
  client: {
    finishAuth: vi.fn().mockResolvedValue(undefined),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mcpClientsManagerMock.refreshClient.mockResolvedValue(undefined);
});

describe("GET /api/mcp/oauth/callback", () => {
  it("returns 400 HTML page when error param is present", async () => {
    const res = await GET(
      makeRequest({ error: "access_denied", error_description: "User denied" }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("text/html");
    const body = await res.text();
    expect(body).toContain("MCP_OAUTH_ERROR");
    expect(body).toContain("access_denied");
  });

  it("returns 400 HTML page when code is missing", async () => {
    const res = await GET(makeRequest({ state: "some-state" }));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Missing required parameters");
  });

  it("returns 400 HTML page when state is missing", async () => {
    const res = await GET(makeRequest({ code: "auth-code" }));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Missing required parameters");
  });

  it("returns 400 HTML page when session not found by state", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(null);
    const res = await GET(makeRequest({ code: "auth-code", state: "bad-state" }));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Invalid or expired session");
  });

  it("returns 200 HTML page when auth completes successfully", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(OAUTH_SESSION);
    const client = makeClient();
    mcpClientsManagerMock.getClient.mockResolvedValue(client);
    const res = await GET(makeRequest({ code: "valid-code", state: "valid-state" }));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("MCP_OAUTH_SUCCESS");
    expect(body).toContain("Authentication Successful");
  });

  it("calls finishAuth with code and state", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(OAUTH_SESSION);
    const client = makeClient();
    mcpClientsManagerMock.getClient.mockResolvedValue(client);
    await GET(makeRequest({ code: "the-code", state: "the-state" }));
    expect(client.client.finishAuth).toHaveBeenCalledWith("the-code", "the-state");
  });

  it("calls refreshClient after successful auth", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(OAUTH_SESSION);
    const client = makeClient();
    mcpClientsManagerMock.getClient.mockResolvedValue(client);
    await GET(makeRequest({ code: "code", state: "state" }));
    expect(mcpClientsManagerMock.refreshClient).toHaveBeenCalledWith("server-1");
  });

  it("returns 500 HTML page when finishAuth throws", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(OAUTH_SESSION);
    const client = makeClient();
    client.client.finishAuth.mockRejectedValue(new Error("Token exchange failed"));
    mcpClientsManagerMock.getClient.mockResolvedValue(client);
    const res = await GET(makeRequest({ code: "code", state: "state" }));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("MCP_OAUTH_ERROR");
  });

  it("returns HTML with text/html content type on success", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(OAUTH_SESSION);
    mcpClientsManagerMock.getClient.mockResolvedValue(makeClient());
    const res = await GET(makeRequest({ code: "code", state: "state" }));
    expect(res.headers.get("Content-Type")).toBe("text/html");
  });

  it("queries session with the state param", async () => {
    mcpOAuthRepositoryMock.getSessionByState.mockResolvedValue(null);
    await GET(makeRequest({ code: "c", state: "my-state-123" }));
    expect(mcpOAuthRepositoryMock.getSessionByState).toHaveBeenCalledWith("my-state-123");
  });
});
