import { ToolCallOptions, jsonSchema } from "ai";
import {
  type MCPConnectionStatus,
  type MCPServerConfig,
  type MCPToolInfo,
  type McpServerInsert,
  type McpServerSelect,
  type VercelAIMcpTool,
  VercelAIMcpToolTag,
} from "app-types/mcp";
import { colorize } from "consola/utils";
import { McpServerTable } from "lib/db/pg/schema.pg";
import {
  Locker,
  errorToString,
  generateUUID,
  safeJSONParse,
  toAny,
} from "lib/utils";
import globalLogger from "logger";
import { safe } from "ts-safe";
import { type MCPClient, createMCPClient } from "./create-mcp-client";
import { createMCPToolId } from "./mcp-tool-id";
import { createMemoryMCPConfigStorage } from "./memory-mcp-config-storage";

/**
 * Interface for storage of MCP server configurations.
 * Implementations should handle persistent storage of server configs.
 *
 * IMPORTANT: When implementing this interface, be aware that:
 * - Storage can be modified externally (e.g., file edited manually)
 * - Concurrent modifications may occur from multiple processes
 * - Implementations should either handle these scenarios or document limitations
 */
export interface MCPConfigStorage {
  init(manager: MCPClientsManager): Promise<void>;
  loadAll(): Promise<McpServerSelect[]>;
  save(server: McpServerInsert): Promise<McpServerSelect>;
  delete(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
  get(id: string): Promise<McpServerSelect | null>;
  updateToolInfo?(id: string, toolInfo: MCPToolInfo[]): Promise<void>;
  updateConnectionStatus?(
    id: string,
    status: MCPConnectionStatus,
  ): Promise<void>;
}

export class MCPClientsManager {
  protected clients = new Map<
    string,
    {
      client: MCPClient;
      name: string;
    }
  >();
  private initializedLock = new Locker();
  private initialized = false;
  /**
   * Per-server entitlement gate: tool names admins switched off.
   * Kept in memory so filtering tool lists / rejecting calls is O(1);
   * hydrated from storage on init/refresh and updated via setDisabledTools.
   */
  private disabledToolsByServer = new Map<string, Set<string>>();
  private logger = globalLogger.withDefaults({
    message: colorize("dim", `[${generateUUID().slice(0, 4)}] MCP Manager: `),
  });

  // Optional storage for persistent configurations
  constructor(
    private storage: MCPConfigStorage = createMemoryMCPConfigStorage(),
    private autoDisconnectSeconds: number = 60 * 30, // 30 minutes
  ) {
    process.on("SIGINT", this.cleanup.bind(this));
    process.on("SIGTERM", this.cleanup.bind(this));
  }

  private async waitInitialized() {
    if (this.initialized) {
      return;
    }
    if (this.initializedLock.isLocked) {
      await this.initializedLock.wait();
      return;
    }
    await this.init();
  }

  async init() {
    this.logger.info("Initializing MCP clients manager");
    if (this.initializedLock.isLocked) {
      this.logger.info(
        "MCP clients manager already initialized, waiting for lock",
      );
      return this.initializedLock.wait();
    }
    if (this.initialized) {
      this.logger.info("MCP clients manager already initialized");
      return;
    }
    return safe(() => this.initializedLock.lock())
      .ifOk(async () => {
        if (this.storage) {
          await this.storage.init(this);
          const configs = await this.storage.loadAll();
          await Promise.all(
            configs.map(
              ({
                id,
                name,
                config,
                toolInfo,
                lastConnectionStatus,
                disabledTools,
              }) => {
                this.setDisabledTools(id, disabledTools);
                if (toolInfo?.length) {
                  this.logger.info(
                    `Loading cached tool info for ${name} (${toolInfo.length} tools)`,
                  );
                  this.addClientWithCachedToolInfo(id, name, config, toolInfo);
                  return Promise.resolve();
                }
                // Register errored servers without connecting
                // — user can manually refresh these from the UI
                if (lastConnectionStatus === "error") {
                  this.logger.info(
                    `Registering ${name} without connect (last status: error)`,
                  );
                  this.addClientWithCachedToolInfo(id, name, config, []);
                  return Promise.resolve();
                }
                // New servers or servers without cache — connect in background
                return this.addClient(id, name, config).catch(() => {
                  `ignore error`;
                });
              },
            ),
          );
        }
      })
      .watch(() => {
        this.initializedLock.unlock();
        this.initialized = true;
      })
      .unwrap();
  }

  /**
   * Replaces the in-memory disabled-tool set for a server.
   * null / [] means every tool is enabled.
   */
  setDisabledTools(id: string, disabledTools?: string[] | null) {
    if (disabledTools?.length) {
      this.disabledToolsByServer.set(id, new Set(disabledTools));
    } else {
      this.disabledToolsByServer.delete(id);
    }
  }

  /** Whether an admin switched this tool off for the given server. */
  isToolDisabled(id: string, toolName: string): boolean {
    return this.disabledToolsByServer.get(id)?.has(toolName) ?? false;
  }

  /**
   * Returns all tools from all clients as a flat object.
   * Tools an admin switched off (server.disabledTools) are never exposed.
   */
  async tools(): Promise<Record<string, VercelAIMcpTool>> {
    await this.waitInitialized();
    return Array.from(this.clients.entries()).reduce(
      (acc, [id, client]) => {
        if (!client.client?.toolInfo?.length) return acc;
        const clientName = client.name;
        const disabled = this.disabledToolsByServer.get(id);
        const enabledToolInfo = disabled
          ? client.client.toolInfo.filter((tool) => !disabled.has(tool.name))
          : client.client.toolInfo;
        return {
          ...acc,
          ...enabledToolInfo.reduce(
            (bcc, tool) => {
              return {
                ...bcc,
                [createMCPToolId(clientName, tool.name)]:
                  VercelAIMcpToolTag.create({
                    description: tool.description,
                    inputSchema: jsonSchema(
                      toAny({
                        ...tool.inputSchema,
                        properties: tool.inputSchema?.properties ?? {},
                        additionalProperties: false,
                      }),
                    ),
                    _originToolName: tool.name,
                    _mcpServerName: clientName,
                    _mcpServerId: id,
                    execute: (params, options: ToolCallOptions) => {
                      options?.abortSignal?.throwIfAborted();
                      return this.toolCall(id, tool.name, params);
                    },
                  }),
              };
            },
            {} as Record<string, VercelAIMcpTool>,
          ),
        };
      },
      {} as Record<string, VercelAIMcpTool>,
    );
  }
  /**
   * Creates a client with cached tool info but does NOT connect.
   * The connection will happen lazily when a tool is actually called.
   */
  private addClientWithCachedToolInfo(
    id: string,
    name: string,
    serverConfig: MCPServerConfig,
    cachedToolInfo: MCPToolInfo[],
  ) {
    if (this.clients.has(id)) {
      const prevClient = this.clients.get(id)!;
      void prevClient.client.disconnect();
    }
    const client = createMCPClient(id, name, serverConfig, {
      autoDisconnectSeconds: this.autoDisconnectSeconds,
      initialToolInfo: cachedToolInfo,
      onToolInfoUpdate: (toolInfo) => {
        this.storage?.updateToolInfo?.(id, toolInfo);
      },
      onConnectionStatusChange: (status) => {
        this.storage?.updateConnectionStatus?.(id, status);
      },
    });
    this.clients.set(id, { client, name });
  }

  /**
   * Creates and adds a new client instance to memory only (no storage persistence)
   */
  async addClient(id: string, name: string, serverConfig: MCPServerConfig) {
    if (this.clients.has(id)) {
      const prevClient = this.clients.get(id)!;
      void prevClient.client.disconnect();
    }
    const client = createMCPClient(id, name, serverConfig, {
      autoDisconnectSeconds: this.autoDisconnectSeconds,
      onToolInfoUpdate: (toolInfo) => {
        this.storage?.updateToolInfo?.(id, toolInfo);
      },
      onConnectionStatusChange: (status) => {
        this.storage?.updateConnectionStatus?.(id, status);
      },
    });
    this.clients.set(id, { client, name });
    return client.connect();
  }

  /**
   * Persists a new client configuration to storage and adds the client instance to memory
   */
  async persistClient(server: typeof McpServerTable.$inferInsert) {
    let id = server.name;
    if (this.storage) {
      const entity = await this.storage.save(server);
      id = entity.id;
      this.setDisabledTools(id, entity.disabledTools);
    }
    await this.addClient(id, server.name, server.config).catch((err) => {
      if (!server.id) {
        void this.removeClient(id);
      }
      throw err;
    });

    return this.clients.get(id)!;
  }

  /**
   * Removes a client by name, disposing resources and removing from storage
   */
  async removeClient(id: string) {
    if (this.storage) {
      if (await this.storage.has(id)) {
        await this.storage.delete(id);
      }
    }
    this.disabledToolsByServer.delete(id);
    this.disconnectClient(id);
  }

  async disconnectClient(id: string) {
    const client = this.clients.get(id);
    this.clients.delete(id);
    if (client) {
      void client.client.disconnect();
    }
  }

  /**
   * Refreshes an existing client with a new configuration or its existing config
   */
  async refreshClient(id: string) {
    await this.waitInitialized();
    const server = await this.storage.get(id);
    if (!server) {
      throw new Error(`Client ${id} not found`);
    }
    this.logger.info(`Refreshing client ${server.name}`);
    this.setDisabledTools(id, server.disabledTools);
    await this.addClient(id, server.name, server.config);
    return this.clients.get(id)!;
  }

  async cleanup() {
    const clients = Array.from(this.clients.values());
    this.clients.clear();
    await Promise.allSettled(clients.map(({ client }) => client.disconnect()));
  }

  async getClients() {
    await this.waitInitialized();
    return Array.from(this.clients.entries()).map(([id, { client }]) => ({
      id,
      client: client,
    }));
  }
  async getClient(id: string) {
    await this.waitInitialized();
    const client = this.clients.get(id);
    if (!client) {
      await this.refreshClient(id);
    }

    return this.clients.get(id);
  }
  async toolCallByServerName(
    serverName: string,
    toolName: string,
    input: unknown,
  ) {
    const clients = await this.getClients();
    const client = clients.find((c) => c.client.getInfo().name === serverName);
    if (!client) {
      if (this.storage) {
        const servers = await this.storage.loadAll();
        const server = servers.find((s) => s.name === serverName);
        if (server) {
          return this.toolCall(server.id, toolName, input);
        }
      }
      throw new Error(`Client ${serverName} not found`);
    }
    return this.toolCall(client.id, toolName, input);
  }
  async toolCall(id: string, toolName: string, input: unknown) {
    return safe(() => {
      if (this.isToolDisabled(id, toolName)) {
        throw new Error(
          `Tool "${toolName}" is switched off for this connector by an administrator.`,
        );
      }
      return this.getClient(id);
    })
      .map((client) => {
        if (!client) throw new Error(`Client ${id} not found`);
        return client.client;
      })
      .map((client) => client.callTool(toolName, input))
      .map((res) => {
        if (res?.content && Array.isArray(res.content)) {
          const parsedResult = {
            ...res,
            content: res.content.map((c: any) => {
              if (c?.type === "text" && c?.text) {
                const parsed = safeJSONParse(c.text);
                return {
                  type: "text",
                  text: parsed.success ? parsed.value : c.text,
                };
              }
              return c;
            }),
          };
          return parsedResult;
        }
        return res;
      })
      .ifFail((err) => {
        return {
          isError: true,
          error: {
            message: errorToString(err),
            name: err?.name || "ERROR",
          },
          content: [],
        };
      })
      .unwrap();
  }
}

export function createMCPClientsManager(
  storage?: MCPConfigStorage,
  autoDisconnectSeconds: number = 60 * 30, // 30 minutes
): MCPClientsManager {
  return new MCPClientsManager(storage, autoDisconnectSeconds);
}
