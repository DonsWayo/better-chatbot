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
