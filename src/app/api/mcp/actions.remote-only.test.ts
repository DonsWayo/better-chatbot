import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  mcpClientsManagerMock,
  mcpRepositoryMock,
  getCurrentUserMock,
  canCreateMCPMock,
} = vi.hoisted(() => ({
  mcpClientsManagerMock: {
    persistClient: vi.fn(),
  },
  mcpRepositoryMock: {
    existsByServerName: vi.fn(),
  },
  getCurrentUserMock: vi.fn(),
  canCreateMCPMock: vi.fn(),
}));

vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: mcpClientsManagerMock,
}));

vi.mock("lib/db/repository", () => ({
  mcpRepository: mcpRepositoryMock,
  mcpOAuthRepository: {},
}));

vi.mock("lib/auth/permissions", () => ({
  getCurrentUser: getCurrentUserMock,
  canCreateMCP: canCreateMCPMock,
  canManageMCPServer: vi.fn(),
  canShareMCPServer: vi.fn(),
}));

// Simulate a cloud deployment: remote-only is enforced (like claude.ai web).
vi.mock("lib/const", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lib/const")>();
  return { ...actual, IS_MCP_SERVER_REMOTE_ONLY: true };
});

import { saveMcpClientAction, isMcpServerRemoteOnlyAction } from "./actions";

const mockUser = { id: "user-1", role: "user" as const };

const STDIO_CONFIG = { command: "node", args: ["server.js"] };
const REMOTE_CONFIG = { url: "https://mcp.example.com/sse" };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(mockUser);
  canCreateMCPMock.mockResolvedValue(true);
});

describe("saveMcpClientAction — remote-only deployment (cloud)", () => {
  // Structured results (not throws): thrown Server Action errors are masked
  // into an opaque 500 in production, hiding the reason from the user.
  it("rejects stdio configs with a clear error", async () => {
    const result = await saveMcpClientAction({
      name: "local-server",
      config: STDIO_CONFIG,
    } as Parameters<typeof saveMcpClientAction>[0]);
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(
        /Local \(stdio\) MCP servers are not supported/,
      ),
    });
  });

  it("error message mentions the desktop app", async () => {
    const result = await saveMcpClientAction({
      name: "local-server",
      config: STDIO_CONFIG,
    } as Parameters<typeof saveMcpClientAction>[0]);
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/desktop app/),
    });
  });

  it("does not persist a stdio config", async () => {
    await saveMcpClientAction({
      name: "local-server",
      config: STDIO_CONFIG,
    } as Parameters<typeof saveMcpClientAction>[0]);
    expect(mcpClientsManagerMock.persistClient).not.toHaveBeenCalled();
  });

  it("still accepts remote (url) configs", async () => {
    mcpClientsManagerMock.persistClient.mockResolvedValue("server-1");
    const result = await saveMcpClientAction({
      name: "remote-server",
      config: REMOTE_CONFIG,
    } as Parameters<typeof saveMcpClientAction>[0]);
    expect(result).toEqual({ success: true, id: "server-1" });
    expect(mcpClientsManagerMock.persistClient).toHaveBeenCalledWith(
      expect.objectContaining({ config: REMOTE_CONFIG }),
    );
  });

  it("remote config with headers is accepted", async () => {
    mcpClientsManagerMock.persistClient.mockResolvedValue("server-2");
    const config = {
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer token" },
    };
    await saveMcpClientAction({
      name: "remote-with-auth",
      config,
    } as unknown as Parameters<typeof saveMcpClientAction>[0]);
    expect(mcpClientsManagerMock.persistClient).toHaveBeenCalledTimes(1);
  });

  it("stdio rejection happens before name-duplication checks", async () => {
    await saveMcpClientAction({
      name: "local-server",
      config: STDIO_CONFIG,
      visibility: "public",
    } as Parameters<typeof saveMcpClientAction>[0]).catch(() => undefined);
    expect(mcpRepositoryMock.existsByServerName).not.toHaveBeenCalled();
  });

  it("isMcpServerRemoteOnlyAction reports true", async () => {
    await expect(isMcpServerRemoteOnlyAction()).resolves.toBe(true);
  });
});
