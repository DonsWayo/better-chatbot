import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  pgMcpRepositoryMock,
  canManageMCPServerMock,
  removeMcpClientActionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  pgMcpRepositoryMock: { selectById: vi.fn() },
  canManageMCPServerMock: vi.fn(),
  removeMcpClientActionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/pg/repositories/mcp-repository.pg", () => ({
  pgMcpRepository: pgMcpRepositoryMock,
}));
vi.mock("lib/auth/permissions", () => ({
  canManageMCPServer: canManageMCPServerMock,
}));
vi.mock("@/app/api/mcp/actions", () => ({
  removeMcpClientAction: removeMcpClientActionMock,
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { DELETE } from "./route";

const makeContext = (id: string) => ({ params: Promise.resolve({ id }) });

const MCP_SERVER = {
  id: "mcp-1",
  userId: "user-1",
  visibility: "private",
  name: "My MCP",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/mcp/[id]", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when mcp server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user cannot manage mcp server", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(false);
    const res = await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(res.status).toBe(403);
  });

  it("deletes and returns success when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(true);
    removeMcpClientActionMock.mockResolvedValue(undefined);
    const res = await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("calls canManageMCPServer with userId and visibility from the mcp server record", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(true);
    removeMcpClientActionMock.mockResolvedValue(undefined);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(canManageMCPServerMock).toHaveBeenCalledWith("user-1", "private");
  });

  it("calls removeMcpClientAction with the mcp server id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(true);
    removeMcpClientActionMock.mockResolvedValue(undefined);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-abc"),
    );
    expect(removeMcpClientActionMock).toHaveBeenCalledWith("mcp-abc");
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockRejectedValue(new Error("DB fail"));
    const res = await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB fail");
  });

  it("calls selectById with the correct mcp id", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(null);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-target"),
    );
    expect(pgMcpRepositoryMock.selectById).toHaveBeenCalledWith("mcp-target");
  });

  it("does not call canManageMCPServer when server not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(null);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(canManageMCPServerMock).not.toHaveBeenCalled();
  });

  it("does not call removeMcpClientAction when not authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(false);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(removeMcpClientActionMock).not.toHaveBeenCalled();
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(true);
    removeMcpClientActionMock.mockResolvedValue(undefined);
    const res = await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not call selectById when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(pgMcpRepositoryMock.selectById).not.toHaveBeenCalled();
  });

  it("calls removeMcpClientAction exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    pgMcpRepositoryMock.selectById.mockResolvedValue(MCP_SERVER);
    canManageMCPServerMock.mockResolvedValue(true);
    removeMcpClientActionMock.mockResolvedValue(undefined);
    await DELETE(
      new Request("http://x") as Parameters<typeof DELETE>[0],
      makeContext("mcp-1"),
    );
    expect(removeMcpClientActionMock).toHaveBeenCalledTimes(1);
  });
});
