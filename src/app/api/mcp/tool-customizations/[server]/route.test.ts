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
});
