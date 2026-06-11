import type { MCPServerConfig } from "app-types/mcp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPClient } from "./create-mcp-client";
import {
  MCPClientsManager,
  createMCPClientsManager,
} from "./create-mcp-clients-manager";
import type { MCPConfigStorage } from "./create-mcp-clients-manager";

// Mock dependencies
vi.mock("./create-mcp-client", () => ({
  createMCPClient: vi.fn(),
}));

// Local-MCP governance plane: policy resolution + audit are db-backed; tests
// drive them through these controllable mocks. Default enabled so the
// pre-existing suites (which use a stdio config) keep exercising tool flow.
const localMcp = vi.hoisted(() => ({
  runtimeEnabled: true,
  auditMock: vi.fn(async () => {}),
  consentRequestMock: vi.fn(async () => ({
    requestId: "req-1",
    deduped: false,
  })),
}));
vi.mock("./local-policy", () => ({
  isLocalMcpRuntimeEnabled: vi.fn(async () => localMcp.runtimeEnabled),
  requestLocalMcpArmApproval: localMcp.consentRequestMock,
}));
vi.mock("./audit", () => ({
  auditMcpInvocation: localMcp.auditMock,
}));

vi.mock("./mcp-tool-id", () => ({
  createMCPToolId: vi.fn((serverName, toolName) => `${serverName}:${toolName}`),
}));

vi.mock("lib/utils", () => ({
  Locker: vi.fn(() => ({
    lock: vi.fn(),
    unlock: vi.fn(),
    wait: vi.fn(),
    isLocked: false,
  })),
  generateUUID: vi.fn(() => "mock-uuid-12345678"),
  toAny: <T>(v: T) => v,
  errorToString: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  safeJSONParse: (text: string) => {
    try {
      return { success: true, value: JSON.parse(text) };
    } catch {
      return { success: false };
    }
  },
}));

// Faithful mini-implementation of the ts-safe chain (map/ifOk/ifFail/watch/
// unwrap) so both the init flow and toolCall error handling behave like prod.
vi.mock("ts-safe", () => {
  type Chain = {
    map: (fn: (v: unknown) => unknown) => Chain;
    ifOk: (fn: (v: unknown) => unknown) => Chain;
    ifFail: (fn: (e: unknown) => unknown) => Chain;
    watch: (fn: (r: unknown) => unknown) => Chain;
    unwrap: () => Promise<unknown>;
  };
  const wrap = (p: Promise<unknown>): Chain => ({
    map: (fn) => wrap(p.then(fn)),
    ifOk: (fn) =>
      wrap(
        p.then(async (v) => {
          await fn(v);
          return v;
        }),
      ),
    ifFail: (fn) => wrap(p.catch((e) => fn(e))),
    watch: (fn) =>
      wrap(
        p.then(
          (v) => {
            fn({ isOk: true, value: v });
            return v;
          },
          (e) => {
            fn({ isOk: false, error: e });
            throw e;
          },
        ),
      ),
    unwrap: () => p,
  });
  return {
    safe: (fn: () => unknown) => {
      try {
        return wrap(Promise.resolve(fn()));
      } catch (e) {
        return wrap(Promise.reject(e));
      }
    },
  };
});

const mockCreateMCPClient = await import("./create-mcp-client").then(
  (m) => m.createMCPClient,
);

describe("MCPClientsManager", () => {
  let manager: MCPClientsManager;
  let mockStorage: MCPConfigStorage;
  let mockClient: MCPClient;

  const mockServerConfig: MCPServerConfig = {
    command: "python",
    args: ["test.py"],
  };

  const mockServer = {
    id: "test-server",
    name: "test-server",
    config: mockServerConfig,
    enabled: true,
    userId: "test-user-id",
    visibility: "private" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localMcp.runtimeEnabled = true;

    // Mock process.on to prevent actual listener registration
    vi.spyOn(process, "on").mockImplementation(() => process);

    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getInfo: vi.fn(() => ({
        name: "test-server",
        config: mockServerConfig,
        status: "connected" as const,
        toolInfo: [
          {
            name: "test-tool",
            description: "A test tool",
            inputSchema: {},
          },
        ],
      })),
      tools: {
        "test-tool": vi.fn(),
      },
    } as unknown as MCPClient;

    vi.mocked(mockCreateMCPClient).mockReturnValue(mockClient);

    mockStorage = {
      init: vi.fn(),
      loadAll: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      get: vi.fn(),
    };
  });

  afterEach(async () => {
    vi.clearAllTimers();
    // Clean up any manager instances to prevent memory leaks
    if (manager) {
      await manager.cleanup();
    }
  });

  describe("constructor", () => {
    it("should create manager without storage", () => {
      manager = new MCPClientsManager();
      expect(manager).toBeInstanceOf(MCPClientsManager);
    });

    it("should create manager with storage", () => {
      manager = new MCPClientsManager(mockStorage);
      expect(manager).toBeInstanceOf(MCPClientsManager);
    });

    it("should create manager with custom auto-disconnect timeout", () => {
      manager = new MCPClientsManager(mockStorage, 1800); // 30 minutes
      expect(manager).toBeInstanceOf(MCPClientsManager);
    });
  });

  describe("init", () => {
    beforeEach(() => {
      manager = new MCPClientsManager(mockStorage);
    });

    it("should initialize without storage", async () => {
      manager = new MCPClientsManager();
      await expect(manager.init()).resolves.toBeUndefined();
    });

    it("should initialize with storage and connect new servers", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([mockServer]);

      await manager.init();

      expect(mockStorage.init).toHaveBeenCalledWith(manager);
      expect(mockStorage.loadAll).toHaveBeenCalled();
      expect(mockCreateMCPClient).toHaveBeenCalledWith(
        "test-server",
        "test-server",
        mockServerConfig,
        expect.objectContaining({ autoDisconnectSeconds: 1800 }),
      );
      // New servers (no cache, no error) connect during init
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it("should use cached tool info and skip connect", async () => {
      const cachedToolInfo = [
        { name: "cached-tool", description: "A cached tool" },
      ];
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo: cachedToolInfo },
      ]);

      await manager.init();

      expect(mockCreateMCPClient).toHaveBeenCalledWith(
        "test-server",
        "test-server",
        mockServerConfig,
        expect.objectContaining({
          autoDisconnectSeconds: 1800,
          initialToolInfo: cachedToolInfo,
        }),
      );
      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it("should connect when no cached tool info exists", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo: null },
      ]);

      await manager.init();

      expect(mockClient.connect).toHaveBeenCalled();
    });

    it("should register errored servers without connecting", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo: null, lastConnectionStatus: "error" },
      ]);

      await manager.init();

      expect(mockCreateMCPClient).toHaveBeenCalled();
      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it("should handle storage initialization errors", async () => {
      vi.mocked(mockStorage.init).mockRejectedValue(new Error("Storage error"));

      await expect(manager.init()).rejects.toThrow("Storage error");
    });
  });

  describe("addClient", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
    });

    it("should add new client", async () => {
      await manager.addClient("new-server", "new-server", mockServerConfig);

      expect(mockCreateMCPClient).toHaveBeenCalledWith(
        "new-server",
        "new-server",
        mockServerConfig,
        expect.objectContaining({ autoDisconnectSeconds: 1800 }),
      );
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it("should replace existing client", async () => {
      // Add first client
      await manager.addClient("test-server", "test-server", mockServerConfig);

      const firstClient = mockClient;
      const secondClient = {
        ...mockClient,
        disconnect: vi.fn(),
      } as unknown as MCPClient;
      vi.mocked(mockCreateMCPClient).mockReturnValue(secondClient);

      // Add client with same ID
      await manager.addClient("test-server", "test-server", mockServerConfig);

      expect(firstClient.disconnect).toHaveBeenCalled();
      expect(secondClient.connect).toHaveBeenCalled();
    });
  });

  describe("persistClient", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
    });

    it("should persist client with storage", async () => {
      const serverToSave = {
        name: "new-server",
        config: mockServerConfig,
        userId: "test-user-id",
      };

      vi.mocked(mockStorage.save).mockResolvedValue({
        ...serverToSave,
        id: "new-server-id",
        visibility: "private" as const,
      });

      await manager.persistClient(serverToSave);

      expect(mockStorage.save).toHaveBeenCalledWith(serverToSave);
      expect(mockCreateMCPClient).toHaveBeenCalledWith(
        "new-server-id",
        "new-server",
        mockServerConfig,
        expect.objectContaining({ autoDisconnectSeconds: 1800 }),
      );
    });

    it("should persist client without storage", async () => {
      manager = new MCPClientsManager();
      await manager.init();

      const serverToSave = {
        name: "new-server",
        config: mockServerConfig,
        userId: "test-user-id",
      };

      await manager.persistClient(serverToSave);

      expect(mockCreateMCPClient).toHaveBeenCalledWith(
        "memory-1",
        "new-server",
        mockServerConfig,
        expect.objectContaining({ autoDisconnectSeconds: 1800 }),
      );
    });
  });

  describe("removeClient", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
      await manager.addClient("test-server", "test-server", mockServerConfig);
    });

    it("should remove client with storage", async () => {
      vi.mocked(mockStorage.has).mockResolvedValue(true);

      await manager.removeClient("test-server");

      expect(mockStorage.has).toHaveBeenCalledWith("test-server");
      expect(mockStorage.delete).toHaveBeenCalledWith("test-server");
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it("should remove client without storage persistence", async () => {
      vi.mocked(mockStorage.has).mockResolvedValue(false);

      await manager.removeClient("test-server");

      expect(mockStorage.has).toHaveBeenCalledWith("test-server");
      expect(mockStorage.delete).not.toHaveBeenCalled();
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it("should handle removing non-existent client", async () => {
      vi.mocked(mockStorage.has).mockResolvedValue(false);

      await manager.removeClient("non-existent");

      expect(mockStorage.delete).not.toHaveBeenCalled();
    });
  });

  describe("refreshClient", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
      await manager.addClient("test-server", "test-server", mockServerConfig);
    });

    it("should refresh client with storage", async () => {
      const updatedConfig = { command: "node", args: ["test.js"] };
      const updatedServer = {
        ...mockServer,
        config: updatedConfig,
        userId: "test-user-id",
        visibility: "private" as const,
      };

      vi.mocked(mockStorage.get).mockResolvedValue(updatedServer);

      const newClient = { ...mockClient } as unknown as MCPClient;
      vi.mocked(mockCreateMCPClient).mockReturnValue(newClient);

      await manager.refreshClient("test-server");

      expect(mockStorage.get).toHaveBeenCalledWith("test-server");
      expect(mockCreateMCPClient).toHaveBeenCalledWith(
        "test-server",
        "test-server",
        updatedConfig,
        expect.objectContaining({ autoDisconnectSeconds: 1800 }),
      );
    });

    it("should throw error for non-existent client", async () => {
      await expect(manager.refreshClient("non-existent")).rejects.toThrow(
        "Client non-existent not found",
      );
    });

    it("should throw error when storage client not found", async () => {
      vi.mocked(mockStorage.get).mockResolvedValue(null);

      await expect(manager.refreshClient("test-server")).rejects.toThrow(
        "Client test-server not found",
      );
    });
  });

  describe("getClients", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
    });

    it("should return empty array when no clients", async () => {
      const clients = await manager.getClients();
      expect(clients).toEqual([]);
    });

    it("should return all clients", async () => {
      await manager.addClient("server1", "server1", mockServerConfig);
      await manager.addClient("server2", "server2", mockServerConfig);

      const clients = await manager.getClients();

      expect(clients).toHaveLength(2);
      expect(clients[0]).toEqual({
        id: "server1",
        client: mockClient,
      });
      expect(clients[1]).toEqual({
        id: "server2",
        client: mockClient,
      });
    });
  });

  describe("tools", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
    });

    it("should return empty object when no clients", async () => {
      const tools = await manager.tools();
      expect(tools).toEqual({});
    });

    it("should exclude clients with no tools", async () => {
      const clientWithoutTools = {
        ...mockClient,
        getInfo: vi.fn(() => ({
          name: "empty-server",
          config: mockServerConfig,
          status: "connected" as const,
          toolInfo: [],
        })),
        tools: {},
      } as unknown as MCPClient;

      vi.mocked(mockCreateMCPClient).mockReturnValue(clientWithoutTools);
      await manager.addClient("empty-server", "empty-server", mockServerConfig);

      const tools = await manager.tools();
      expect(tools).toEqual({});
    });
  });

  describe("disabled tools (per-tool entitlements)", () => {
    const toolInfo = [
      { name: "tool-a", description: "Tool A", inputSchema: {} },
      { name: "tool-b", description: "Tool B", inputSchema: {} },
    ];

    let clientWithTools: MCPClient;

    beforeEach(() => {
      clientWithTools = {
        ...mockClient,
        toolInfo,
        callTool: vi.fn().mockResolvedValue({ content: [] }),
      } as unknown as MCPClient;
      vi.mocked(mockCreateMCPClient).mockReturnValue(clientWithTools);
      manager = new MCPClientsManager(mockStorage);
    });

    it("hydrates the gate from storage on init and filters tools()", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo, disabledTools: ["tool-b"] },
      ]);

      await manager.init();
      const tools = await manager.tools();

      expect(Object.keys(tools)).toEqual(["test-server:tool-a"]);
      expect(manager.isToolDisabled("test-server", "tool-b")).toBe(true);
      expect(manager.isToolDisabled("test-server", "tool-a")).toBe(false);
    });

    it("exposes every tool when disabledTools is null or empty", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo, disabledTools: null },
      ]);

      await manager.init();
      const tools = await manager.tools();

      expect(Object.keys(tools).sort()).toEqual([
        "test-server:tool-a",
        "test-server:tool-b",
      ]);
    });

    it("setDisabledTools updates filtering immediately without a refresh", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo },
      ]);
      await manager.init();

      manager.setDisabledTools("test-server", ["tool-a"]);
      expect(Object.keys(await manager.tools())).toEqual([
        "test-server:tool-b",
      ]);

      // Re-enabling everything restores the full list
      manager.setDisabledTools("test-server", []);
      expect(Object.keys(await manager.tools()).sort()).toEqual([
        "test-server:tool-a",
        "test-server:tool-b",
      ]);
    });

    it("rejects direct invocation of a disabled tool with a clear error", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo, disabledTools: ["tool-b"] },
      ]);
      await manager.init();

      const result = (await manager.toolCall("test-server", "tool-b", {})) as {
        isError?: boolean;
        error?: { message: string };
      };

      expect(result.isError).toBe(true);
      expect(result.error?.message).toMatch(/switched off/i);
      expect(
        (clientWithTools as unknown as { callTool: ReturnType<typeof vi.fn> })
          .callTool,
      ).not.toHaveBeenCalled();
    });

    it("allows invocation of enabled tools on the same server", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo, disabledTools: ["tool-b"] },
      ]);
      await manager.init();
      // stdio config → per-session consent is also required
      manager.armLocalServer("test-server");

      await manager.toolCall("test-server", "tool-a", {});

      expect(
        (clientWithTools as unknown as { callTool: ReturnType<typeof vi.fn> })
          .callTool,
      ).toHaveBeenCalledWith("tool-a", {});
    });

    it("refreshClient re-hydrates the gate from storage", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo },
      ]);
      await manager.init();
      expect(Object.keys(await manager.tools())).toHaveLength(2);

      vi.mocked(mockStorage.get).mockResolvedValue({
        ...mockServer,
        toolInfo,
        disabledTools: ["tool-a"],
      });
      await manager.refreshClient("test-server");

      expect(Object.keys(await manager.tools())).toEqual([
        "test-server:tool-b",
      ]);
    });

    it("removeClient clears the gate for that server", async () => {
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        { ...mockServer, toolInfo, disabledTools: ["tool-b"] },
      ]);
      await manager.init();
      vi.mocked(mockStorage.has).mockResolvedValue(true);

      await manager.removeClient("test-server");

      expect(manager.isToolDisabled("test-server", "tool-b")).toBe(false);
    });
  });

  describe("local stdio governance (ADR-0010)", () => {
    const toolInfo = [
      { name: "local-tool", description: "Local tool", inputSchema: {} },
    ];
    const remoteConfig: MCPServerConfig = { url: "https://mcp.example.com" };

    const stdioServer = { ...mockServer, toolInfo };
    const remoteServer = {
      ...mockServer,
      id: "remote-server",
      name: "remote-server",
      config: remoteConfig,
      toolInfo,
    };

    const flushAudit = () => new Promise((resolve) => setTimeout(resolve, 0));

    let clientsByName: Record<string, MCPClient>;

    const makeClient = (name: string, config: MCPServerConfig) =>
      ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        getInfo: vi.fn(() => ({
          name,
          config,
          status: "connected" as const,
          toolInfo,
        })),
        toolInfo,
        callTool: vi.fn().mockResolvedValue({ content: [] }),
      }) as unknown as MCPClient;

    beforeEach(() => {
      clientsByName = {};
      vi.mocked(mockCreateMCPClient).mockImplementation((_id, name, config) => {
        const client = makeClient(name, config);
        clientsByName[name] = client;
        return client;
      });
      vi.mocked(mockStorage.loadAll).mockResolvedValue([
        stdioServer,
        remoteServer,
      ]);
      vi.mocked(mockStorage.get).mockImplementation(async (id: string) =>
        id === "test-server" ? stdioServer : remoteServer,
      );
      manager = new MCPClientsManager(mockStorage);
    });

    const callToolOf = (name: string) =>
      (clientsByName[name] as unknown as { callTool: ReturnType<typeof vi.fn> })
        .callTool;

    it("hydrates the gate on init: policy off filters stdio tools but keeps remote tools", async () => {
      localMcp.runtimeEnabled = false;
      await manager.init();

      expect(Object.keys(await manager.tools())).toEqual([
        "remote-server:local-tool",
      ]);
      expect(manager.isLocalMcpEnabled()).toBe(false);
    });

    it("policy off rejects stdio toolCall with a policy message and audits the denial", async () => {
      localMcp.runtimeEnabled = false;
      await manager.init();

      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as {
        isError?: boolean;
        error?: { message: string };
      };

      expect(result.isError).toBe(true);
      expect(result.error?.message).toMatch(/disabled by your organization/i);
      expect(callToolOf("test-server")).not.toHaveBeenCalled();

      await flushAudit();
      expect(localMcp.auditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "test-user-id",
          mcpServerId: "test-server",
          toolName: "local-tool",
          outcome: "error",
        }),
      );
    });

    it("policy off leaves remote toolCall untouched (no audit row from the manager)", async () => {
      localMcp.runtimeEnabled = false;
      await manager.init();

      await manager.toolCall("remote-server", "local-tool", {});

      expect(callToolOf("remote-server")).toHaveBeenCalledWith(
        "local-tool",
        {},
      );
      await flushAudit();
      expect(localMcp.auditMock).not.toHaveBeenCalled();
    });

    it("policy on but unarmed: first stdio invocation is rejected with the session-consent message", async () => {
      await manager.init();

      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as {
        isError?: boolean;
        error?: { message: string };
      };

      expect(result.isError).toBe(true);
      expect(result.error?.message).toMatch(/not enabled for this session/i);
      expect(callToolOf("test-server")).not.toHaveBeenCalled();

      await flushAudit();
      expect(localMcp.auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "error" }),
      );
    });

    it("unarmed stdio invocation files an owner-targeted arm approval request (v2 consent)", async () => {
      await manager.init();

      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as { isError?: boolean };
      expect(result.isError).toBe(true);

      await flushAudit();
      expect(localMcp.consentRequestMock).toHaveBeenCalledTimes(1);
      expect(localMcp.consentRequestMock).toHaveBeenCalledWith({
        serverId: "test-server",
        serverName: "test-server",
        toolName: "local-tool",
        userId: "test-user-id",
      });
    });

    it("parallel unarmed invocations file at most one request (in-flight guard)", async () => {
      await manager.init();

      await Promise.all([
        manager.toolCall("test-server", "local-tool", {}),
        manager.toolCall("test-server", "local-tool", {}),
      ]);

      await flushAudit();
      expect(localMcp.consentRequestMock).toHaveBeenCalledTimes(1);
    });

    it("policy off files no consent request (org gate first)", async () => {
      localMcp.runtimeEnabled = false;
      await manager.init();

      await manager.toolCall("test-server", "local-tool", {});

      await flushAudit();
      expect(localMcp.consentRequestMock).not.toHaveBeenCalled();
    });

    it("consent filing failure never changes the rejection path", async () => {
      localMcp.consentRequestMock.mockRejectedValueOnce(
        new Error("approvals unavailable"),
      );
      await manager.init();

      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as { isError?: boolean; error?: { message: string } };

      expect(result.isError).toBe(true);
      expect(result.error?.message).toMatch(/not enabled for this session/i);

      // The guard is released on failure: a later attempt files again.
      await flushAudit();
      await manager.toolCall("test-server", "local-tool", {});
      await flushAudit();
      expect(localMcp.consentRequestMock).toHaveBeenCalledTimes(2);
    });

    it("an approval-sourced grant records grantedBy and unblocks the call until its TTL", async () => {
      await manager.init();

      // What decideApproval(approve) does in-process:
      const armedUntil = manager.armLocalServer("test-server", {
        grantedBy: "approver-1",
      });

      expect(manager.localServerArmedGrant("test-server")).toEqual({
        armedUntil,
        grantedBy: "approver-1",
      });
      expect(manager.localServerArmedUntil("test-server")).toBe(armedUntil);

      await manager.toolCall("test-server", "local-tool", {});
      expect(callToolOf("test-server")).toHaveBeenCalledWith("local-tool", {});
      await flushAudit();
      expect(localMcp.consentRequestMock).not.toHaveBeenCalled();
    });

    it("a denied (still unarmed) server stays blocked", async () => {
      await manager.init();
      // Denial never arms — the manager state is simply still unarmed.
      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as { isError?: boolean };
      expect(result.isError).toBe(true);
      expect(callToolOf("test-server")).not.toHaveBeenCalled();
    });

    it("arming allows the call and audits a success attributed to the server owner", async () => {
      await manager.init();

      const armedUntil = manager.armLocalServer("test-server");
      expect(armedUntil).toBeGreaterThan(Date.now());
      expect(manager.isLocalServerArmed("test-server")).toBe(true);
      expect(manager.localServerArmedUntil("test-server")).toBe(armedUntil);

      await manager.toolCall("test-server", "local-tool", {});

      expect(callToolOf("test-server")).toHaveBeenCalledWith("local-tool", {});
      await flushAudit();
      expect(localMcp.auditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "test-user-id",
          mcpServerId: "test-server",
          toolName: "local-tool",
          outcome: "success",
          durationMs: expect.any(Number),
        }),
      );
    });

    it("arming expires", async () => {
      await manager.init();

      manager.armLocalServer("test-server", { durationMs: -1 });
      expect(manager.isLocalServerArmed("test-server")).toBe(false);
      expect(manager.localServerArmedUntil("test-server")).toBeNull();

      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as {
        isError?: boolean;
      };
      expect(result.isError).toBe(true);
    });

    it("disarmLocalServer withdraws consent", async () => {
      await manager.init();
      manager.armLocalServer("test-server");
      manager.disarmLocalServer("test-server");
      expect(manager.isLocalServerArmed("test-server")).toBe(false);
    });

    it("setLocalMcpEnabled(false) takes effect immediately and clears armed servers", async () => {
      await manager.init();
      manager.armLocalServer("test-server");
      expect(Object.keys(await manager.tools()).sort()).toEqual([
        "remote-server:local-tool",
        "test-server:local-tool",
      ]);

      manager.setLocalMcpEnabled(false);

      expect(Object.keys(await manager.tools())).toEqual([
        "remote-server:local-tool",
      ]);
      expect(manager.isLocalServerArmed("test-server")).toBe(false);

      // Re-enabling restores the tool list but NOT the consent (re-arm needed)
      manager.setLocalMcpEnabled(true);
      expect(Object.keys(await manager.tools()).sort()).toEqual([
        "remote-server:local-tool",
        "test-server:local-tool",
      ]);
      const result = (await manager.toolCall(
        "test-server",
        "local-tool",
        {},
      )) as {
        isError?: boolean;
        error?: { message: string };
      };
      expect(result.isError).toBe(true);
      expect(result.error?.message).toMatch(/not enabled for this session/i);
    });

    it("refreshClient re-resolves the policy gate", async () => {
      await manager.init();
      expect(manager.isLocalMcpEnabled()).toBe(true);

      localMcp.runtimeEnabled = false;
      await manager.refreshClient("test-server");

      expect(manager.isLocalMcpEnabled()).toBe(false);
      expect(Object.keys(await manager.tools())).toEqual([
        "remote-server:local-tool",
      ]);
    });

    it("removeClient disarms the server", async () => {
      await manager.init();
      manager.armLocalServer("test-server");
      vi.mocked(mockStorage.has).mockResolvedValue(true);

      await manager.removeClient("test-server");

      expect(manager.isLocalServerArmed("test-server")).toBe(false);
    });
  });

  describe("cleanup", () => {
    beforeEach(async () => {
      manager = new MCPClientsManager(mockStorage);
      await manager.init();
    });

    it("should disconnect all clients", async () => {
      await manager.addClient("server1", "server1", mockServerConfig);
      await manager.addClient("server2", "server2", mockServerConfig);

      await manager.cleanup();

      expect(mockClient.disconnect).toHaveBeenCalledTimes(2);
    });

    it("should clear clients map", async () => {
      await manager.addClient("test-server", "test-server", mockServerConfig);

      await manager.cleanup();

      const clients = await manager.getClients();
      expect(clients).toEqual([]);
    });
  });

  describe("onToolInfoUpdate callback", () => {
    it("should persist tool info to storage when callback fires", async () => {
      mockStorage.updateToolInfo = vi.fn().mockResolvedValue(undefined);
      manager = new MCPClientsManager(mockStorage);
      await manager.init();

      await manager.addClient("test-server", "test-server", mockServerConfig);

      const createCall = vi.mocked(mockCreateMCPClient).mock.calls.at(-1)!;
      const options = createCall[3] as NonNullable<
        Parameters<typeof mockCreateMCPClient>[3]
      >;
      expect(options.onToolInfoUpdate).toBeDefined();

      const newToolInfo = [{ name: "new-tool", description: "New tool" }];
      options.onToolInfoUpdate?.(newToolInfo);

      expect(mockStorage.updateToolInfo).toHaveBeenCalledWith(
        "test-server",
        newToolInfo,
      );
    });
  });

  describe("onConnectionStatusChange callback", () => {
    it("should persist connection status to storage when callback fires", async () => {
      mockStorage.updateConnectionStatus = vi.fn().mockResolvedValue(undefined);
      manager = new MCPClientsManager(mockStorage);
      await manager.init();

      await manager.addClient("test-server", "test-server", mockServerConfig);

      const createCall = vi.mocked(mockCreateMCPClient).mock.calls.at(-1)!;
      const options = createCall[3] as NonNullable<
        Parameters<typeof mockCreateMCPClient>[3]
      >;
      expect(options.onConnectionStatusChange).toBeDefined();

      options.onConnectionStatusChange?.("connected");

      expect(mockStorage.updateConnectionStatus).toHaveBeenCalledWith(
        "test-server",
        "connected",
      );
    });
  });

  describe("createMCPClientsManager factory function", () => {
    it("should create manager without storage", () => {
      const manager = createMCPClientsManager();
      expect(manager).toBeInstanceOf(MCPClientsManager);
    });

    it("should create manager with storage", () => {
      const manager = createMCPClientsManager(mockStorage);
      expect(manager).toBeInstanceOf(MCPClientsManager);
    });

    it("should create manager with custom timeout", () => {
      const manager = createMCPClientsManager(mockStorage, 3600);
      expect(manager).toBeInstanceOf(MCPClientsManager);
    });
  });

  describe("process signal handlers", () => {
    it("should register cleanup handlers for SIGINT and SIGTERM", () => {
      // Clear previous mocks for this specific test
      vi.clearAllMocks();
      const processSpy = vi
        .spyOn(process, "on")
        .mockImplementation(() => process);

      new MCPClientsManager(mockStorage);

      expect(processSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      expect(processSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    });
  });
});
