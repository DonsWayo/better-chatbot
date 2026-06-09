import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  mcpServerCustomizationRepositoryMock,
  serverCacheMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  mcpServerCustomizationRepositoryMock: {
    selectByUserIdAndMcpServerId: vi.fn(),
    upsertMcpServerCustomization: vi.fn(),
    deleteMcpServerCustomizationByMcpServerIdAndUserId: vi.fn(),
  },
  serverCacheMock: { delete: vi.fn() },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpServerCustomizationRepository: mcpServerCustomizationRepositoryMock,
}));
vi.mock("lib/cache", () => ({ serverCache: serverCacheMock }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: {
    mcpServerCustomizations: (userId: string) => `mcp:server:${userId}`,
  },
}));

import { GET, POST, DELETE } from "./route";

const makeContext = (server: string) => ({
  params: Promise.resolve({ server }),
});

const makeRequest = (body: unknown, method = "POST") =>
  new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const CUSTOMIZATION = {
  id: "sc-1",
  userId: "user-1",
  mcpServerId: "server-1",
  prompt: "Be helpful",
  serverName: "My Server",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mcp/server-customizations/[server]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(401);
  });

  it("returns customization when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpServerCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      CUSTOMIZATION,
    );
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("sc-1");
    expect(body.prompt).toBe("Be helpful");
  });

  it("returns empty object when customization is null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpServerCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      null,
    );
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("calls selectByUserIdAndMcpServerId with server id and user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-99" } });
    mcpServerCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      null,
    );
    await GET(new Request("http://x"), makeContext("server-abc"));
    expect(
      mcpServerCustomizationRepositoryMock.selectByUserIdAndMcpServerId,
    ).toHaveBeenCalledWith({ mcpServerId: "server-abc", userId: "user-99" });
  });
});

describe("POST /api/mcp/server-customizations/[server]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ prompt: "Do X" }), makeContext("server-1"));
    expect(res.status).toBe(401);
  });

  it("upserts and returns customization when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const result = { ...CUSTOMIZATION, prompt: "Do X" };
    mcpServerCustomizationRepositoryMock.upsertMcpServerCustomization.mockResolvedValue(
      result,
    );
    const res = await POST(
      makeRequest({ prompt: "Do X" }),
      makeContext("server-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe("Do X");
  });

  it("calls upsertMcpServerCustomization with userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-session" } });
    mcpServerCustomizationRepositoryMock.upsertMcpServerCustomization.mockResolvedValue(
      CUSTOMIZATION,
    );
    await POST(makeRequest({ prompt: "Test prompt" }), makeContext("server-42"));
    expect(
      mcpServerCustomizationRepositoryMock.upsertMcpServerCustomization,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-session", mcpServerId: "server-42" }),
    );
  });

  it("invalidates cache after upsert", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpServerCustomizationRepositoryMock.upsertMcpServerCustomization.mockResolvedValue(
      CUSTOMIZATION,
    );
    await POST(makeRequest({ prompt: "Test" }), makeContext("server-1"));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("mcp:server:user-1");
  });

  it("passes null prompt when not provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpServerCustomizationRepositoryMock.upsertMcpServerCustomization.mockResolvedValue(
      { ...CUSTOMIZATION, prompt: null },
    );
    await POST(makeRequest({}), makeContext("server-1"));
    expect(
      mcpServerCustomizationRepositoryMock.upsertMcpServerCustomization,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: undefined }),
    );
  });
});

describe("DELETE /api/mcp/server-customizations/[server]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(401);
  });

  it("deletes and returns success when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpServerCustomizationRepositoryMock.deleteMcpServerCustomizationByMcpServerIdAndUserId.mockResolvedValue(
      undefined,
    );
    const res = await DELETE(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls delete with server id and user id from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    mcpServerCustomizationRepositoryMock.deleteMcpServerCustomizationByMcpServerIdAndUserId.mockResolvedValue(
      undefined,
    );
    await DELETE(new Request("http://x"), makeContext("server-xyz"));
    expect(
      mcpServerCustomizationRepositoryMock.deleteMcpServerCustomizationByMcpServerIdAndUserId,
    ).toHaveBeenCalledWith({ mcpServerId: "server-xyz", userId: "user-42" });
  });

  it("invalidates cache after deletion", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpServerCustomizationRepositoryMock.deleteMcpServerCustomizationByMcpServerIdAndUserId.mockResolvedValue(
      undefined,
    );
    await DELETE(new Request("http://x"), makeContext("server-1"));
    expect(serverCacheMock.delete).toHaveBeenCalledWith("mcp:server:user-1");
  });
});
