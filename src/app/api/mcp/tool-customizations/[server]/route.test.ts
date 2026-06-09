import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, mcpMcpToolCustomizationRepositoryMock } = vi.hoisted(
  () => ({
    getSessionMock: vi.fn(),
    mcpMcpToolCustomizationRepositoryMock: {
      selectByUserIdAndMcpServerId: vi.fn(),
    },
  }),
);

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  mcpMcpToolCustomizationRepository: mcpMcpToolCustomizationRepositoryMock,
}));

import { GET } from "./route";

const makeContext = (server: string) => ({
  params: Promise.resolve({ server }),
});

const CUSTOMIZATIONS = [
  { id: "tc-1", toolName: "my-tool", mcpServerId: "server-1", prompt: "Do X" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mcp/tool-customizations/[server]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(401);
  });

  it("returns tool customizations when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      CUSTOMIZATIONS,
    );
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].toolName).toBe("my-tool");
  });

  it("calls selectByUserIdAndMcpServerId with server id and user id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      [],
    );
    await GET(new Request("http://x"), makeContext("server-xyz"));
    expect(
      mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId,
    ).toHaveBeenCalledWith({ mcpServerId: "server-xyz", userId: "user-42" });
  });

  it("returns empty array when no customizations found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      [],
    );
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns null when repository returns null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(
      null,
    );
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("calls repository exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue([]);
    await GET(new Request("http://x"), makeContext("server-1"));
    expect(mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId).toHaveBeenCalledTimes(1);
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue([]);
    const res = await GET(new Request("http://x"), makeContext("server-1"));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not call repository when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET(new Request("http://x"), makeContext("server-1"));
    expect(mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId).not.toHaveBeenCalled();
  });

  it("returns multiple customizations", async () => {
    const many = [
      { id: "tc-1", toolName: "tool-a", mcpServerId: "s", prompt: "A" },
      { id: "tc-2", toolName: "tool-b", mcpServerId: "s", prompt: "B" },
    ];
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue(many);
    const res = await GET(new Request("http://x"), makeContext("s"));
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[1].toolName).toBe("tool-b");
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET(new Request("http://x"), makeContext("server-1"));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("calls repository with undefined userId when session user has no id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue([]);
    await GET(new Request("http://x"), makeContext("server-1"));
    expect(mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
    );
  });

  it("uses prompt from returned customization", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    mcpMcpToolCustomizationRepositoryMock.selectByUserIdAndMcpServerId.mockResolvedValue([
      { id: "tc-1", toolName: "t", mcpServerId: "s", prompt: "My custom prompt" },
    ]);
    const res = await GET(new Request("http://x"), makeContext("s"));
    const body = await res.json();
    expect(body[0].prompt).toBe("My custom prompt");
  });
});
