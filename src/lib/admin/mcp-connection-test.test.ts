import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fake MCP client ────────────────────────────────────────────────────────────
// createMCPClient(...) returns a client whose `status` we mutate per test.
// `connect`/`disconnect` are spies so we can assert disconnect always runs.

interface FakeClient {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  status: string;
  toolInfo: MCPToolInfo[] | undefined;
}

let fakeClient: FakeClient;
const createMCPClientMock = vi.fn<() => FakeClient>(() => fakeClient);

vi.mock("lib/ai/mcp/create-mcp-client", () => ({
  createMCPClient: createMCPClientMock,
}));

vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "fixed-uuid"),
}));

vi.mock("server-only", () => ({}));

const CONFIG: MCPServerConfig = {
  url: "https://example.com/mcp",
} as unknown as MCPServerConfig;

const TOOL_INFO: MCPToolInfo[] = [
  { name: "search", description: "Search" },
  { name: "fetch", description: "Fetch" },
];

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    status: "connected",
    toolInfo: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient = makeClient();
  createMCPClientMock.mockImplementation(() => fakeClient);
});

describe("testMcpServerConnection", () => {
  it("returns ok=true with toolCount and toolInfo when status is 'connected'", async () => {
    fakeClient = makeClient({ status: "connected", toolInfo: TOOL_INFO });
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(true);
    expect(result.toolCount).toBe(2);
    expect(result.toolInfo).toEqual(TOOL_INFO);
    expect(result.needsAuth).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(fakeClient.connect).toHaveBeenCalledTimes(1);
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("treats missing toolInfo on a connected client as an empty tool list", async () => {
    fakeClient = makeClient({ status: "connected", toolInfo: undefined });
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(true);
    expect(result.toolCount).toBe(0);
    expect(result.toolInfo).toEqual([]);
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns needsAuth=true (and ok=false) when status is 'authorizing'", async () => {
    fakeClient = makeClient({ status: "authorizing" });
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(false);
    expect(result.needsAuth).toBe(true);
    expect(result.error).toMatch(/authorization/i);
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns ok=false with an error when status is neither connected nor authorizing", async () => {
    fakeClient = makeClient({ status: "disconnected" });
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(false);
    expect(result.needsAuth).toBeUndefined();
    expect(result.error).toBe("Connection status: disconnected");
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns ok=false with the thrown error message when connect() throws an Error", async () => {
    fakeClient = makeClient();
    fakeClient.connect.mockRejectedValue(new Error("ECONNREFUSED"));
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("ECONNREFUSED");
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic error message when connect() throws a non-Error", async () => {
    fakeClient = makeClient();
    fakeClient.connect.mockRejectedValue("boom");
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection failed");
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("always disconnects — even when disconnect itself rejects (swallowed)", async () => {
    fakeClient = makeClient({ status: "connected", toolInfo: TOOL_INFO });
    fakeClient.disconnect.mockRejectedValue(new Error("disconnect failed"));
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    // Must not throw despite the rejected disconnect.
    const result = await testMcpServerConnection(CONFIG);

    expect(result.ok).toBe(true);
    expect(fakeClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it("passes the provided config through to createMCPClient", async () => {
    fakeClient = makeClient({ status: "connected", toolInfo: [] });
    const { testMcpServerConnection } = await import("./mcp-connection-test");

    await testMcpServerConnection(CONFIG);

    expect(createMCPClientMock).toHaveBeenCalledTimes(1);
    const args = createMCPClientMock.mock.calls[0] as unknown[];
    // (name, kind, config, options)
    expect(args[2]).toBe(CONFIG);
  });
});
