import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getCurrentUserMock,
  canCreateMCPMock,
  insertMcpServerMock,
  refreshClientMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  canCreateMCPMock: vi.fn(),
  insertMcpServerMock: vi.fn(),
  refreshClientMock: vi.fn(),
}));

vi.mock("lib/auth/permissions", () => ({ getCurrentUser: getCurrentUserMock, canCreateMCP: canCreateMCPMock }));
vi.mock("lib/db/repository", () => ({
  mcpRepository: { insertMcpServer: insertMcpServerMock },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    refreshClient: refreshClientMock,
    getClient: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("lib/db/pg/schema.pg", () => ({ McpServerTable: {} }));
vi.mock("better-auth", () => ({ logger: { error: vi.fn() } }));

describe("saveMcpClientAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: { url: "http://mcp" } } as any))
      .rejects.toThrow(/logged in/i);
  });

  it("throws when user cannot create MCP", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "user" });
    canCreateMCPMock.mockResolvedValueOnce(false);
    const { saveMcpClientAction } = await import("./actions");
    await expect(saveMcpClientAction({ name: "Test", config: { url: "http://mcp" } } as any))
      .rejects.toThrow(/permission/i);
  });
});
