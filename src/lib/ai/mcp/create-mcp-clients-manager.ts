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
import { auditMcpInvocation } from "./audit";
import { type MCPClient, createMCPClient } from "./create-mcp-client";
import { isMaybeStdioConfig } from "./is-mcp-config";
import {
  isLocalMcpRuntimeEnabled,
  requestLocalMcpArmApproval,
} from "./local-policy";
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
  /**
   * Local-MCP governance plane (ADR-0010, default-deny per ADR-0009).
   * Hydrated from asafe_org_settings on init/refresh and flipped immediately
   * via setLocalMcpEnabled when an admin toggles the org/team policy. While
   * false, stdio servers' tools never reach tools() and toolCall() rejects
   * them — configs are kept, so re-enabling is instant.
   */
  private localMcpEnabled = false;
  /**
   * Per-session consent (ADR-0010): a stdio server must be explicitly armed
   * before its first invocation in a server session. serverId → grant
   * (armedUntil epoch ms + who granted it). Grants come from two paths:
   * v1's direct "Enable local tools for this session" button, and v2's
   * approval flow (an unarmed invocation files an owner-targeted
   * approval_request; approving it in the Inbox arms here).
   */
  private armedLocalServers = new Map<
    string,
    { armedUntil: number; grantedBy?: string }
  >();
  /**
   * serverIds with a v2 consent request currently being filed — a pure
   * in-process concurrency guard (parallel tool calls in one turn must not
   * race duplicate inserts); cross-call/restart dedupe lives in the
   * approvals lib (one open request per server+user).
   */
  private consentRequestsInFlight = new Set<string>();
  static readonly LOCAL_MCP_ARM_DURATION_MS = 8 * 60 * 60 * 1000; // 8h
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
        // Resolve the local-MCP gate once per init (like disabledTools
        // hydration). Fails closed — default-deny.
        this.localMcpEnabled = await isLocalMcpRuntimeEnabled().catch(
          () => false,
        );
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
   * Flips the in-memory local-MCP gate. Called by the admin policy action
   * right after persisting the org/team setting so enforcement is immediate
   * (no restart, no config deletion).
   */
  setLocalMcpEnabled(enabled: boolean) {
    this.localMcpEnabled = enabled;
    if (!enabled) this.armedLocalServers.clear();
  }

  /** Current process-wide local-MCP gate (org base OR any team override). */
  isLocalMcpEnabled(): boolean {
    return this.localMcpEnabled;
  }

  /**
   * Per-session consent: arm a local stdio server so its tools may run until
   * `armedUntil`. `grantedBy` records the granting user (direct button or
   * Inbox approver) for status display/audit. Returns armedUntil (epoch ms).
   */
  armLocalServer(
    id: string,
    opts?: { durationMs?: number; grantedBy?: string },
  ): number {
    const durationMs =
      opts?.durationMs ?? MCPClientsManager.LOCAL_MCP_ARM_DURATION_MS;
    const armedUntil = Date.now() + durationMs;
    this.armedLocalServers.set(id, { armedUntil, grantedBy: opts?.grantedBy });
    return armedUntil;
  }

  /** Withdraw a session's local-tool consent for a server. */
  disarmLocalServer(id: string) {
    this.armedLocalServers.delete(id);
  }

  /** Whether the server is currently armed (expired entries are pruned). */
  isLocalServerArmed(id: string): boolean {
    const grant = this.armedLocalServers.get(id);
    if (grant === undefined) return false;
    if (Date.now() >= grant.armedUntil) {
      this.armedLocalServers.delete(id);
      return false;
    }
    return true;
  }

  /** The active grant for a server, or null when not armed/expired. */
  localServerArmedGrant(
    id: string,
  ): { armedUntil: number; grantedBy?: string } | null {
    return this.isLocalServerArmed(id)
      ? (this.armedLocalServers.get(id) ?? null)
      : null;
  }

  /** armedUntil (epoch ms) for a server, or null when not armed/expired. */
  localServerArmedUntil(id: string): number | null {
    return this.localServerArmedGrant(id)?.armedUntil ?? null;
  }

  /**
   * Local-MCP consent v2: an unarmed local stdio invocation files an
   * owner-targeted approval_request ("local_mcp_arm") so the grant can happen
   * from the Inbox. Attributed to the server owner (the manager has no caller
   * context — same convention as auditLocalToolCall). Fire-and-forget: filing
   * failures never change the rejection path; v1's direct arming button
   * remains the fallback when approvals are unavailable.
   */
  private requestLocalConsent(id: string, toolName: string) {
    if (this.consentRequestsInFlight.has(id)) return;
    this.consentRequestsInFlight.add(id);
    void (async () => {
      try {
        const server = await this.storage.get(id);
        if (!server?.userId) return;
        await requestLocalMcpArmApproval({
          serverId: id,
          serverName: server.name,
          toolName,
          userId: server.userId,
        });
      } catch (err) {
        this.logger.error("local MCP consent request failed (non-fatal):", err);
      } finally {
        this.consentRequestsInFlight.delete(id);
      }
    })();
  }

  /**
   * Audit every local stdio toolCall (allowed AND denied) into
   * asafe_mcp_invocation_log. The manager has no caller context, so the row
   * is attributed to the server owner (the accountable identity for a local
   * process). Fire-and-forget — audit failure never blocks or rejects.
   */
  private auditLocalToolCall(
    id: string,
    toolName: string,
    outcome: "success" | "error",
    durationMs: number,
  ) {
    void (async () => {
      try {
        const server = await this.storage.get(id);
        if (!server?.userId) return;
        await auditMcpInvocation({
          userId: server.userId,
          mcpServerId: id,
          toolName,
          outcome,
          durationMs,
        });
      } catch (err) {
        this.logger.error("local MCP audit failed (non-fatal):", err);
      }
    })();
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
        // Local-MCP gate: while the policy is off, stdio servers' tools never
        // reach the model's tool list (configs stay registered).
        if (
          !this.localMcpEnabled &&
          isMaybeStdioConfig(client.client.getInfo().config)
        ) {
          return acc;
        }
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

    // Return the persisted server id (serializable) — NOT the live client,
    // which is circular (client → manager) and breaks Server Action / RSC
    // serialization with a stack overflow.
    return id;
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
    this.armedLocalServers.delete(id);
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
    this.localMcpEnabled = await isLocalMcpRuntimeEnabled().catch(() => false);
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
    const startedAt = Date.now();
    let isLocalStdio = false;
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
      .map((client) => {
        // Local-MCP governance (ADR-0010): stdio tools require the org/team
        // policy to be on AND per-session arming before they may execute.
        if (isMaybeStdioConfig(client.getInfo().config)) {
          isLocalStdio = true;
          if (!this.localMcpEnabled) {
            throw new Error(
              `Local (stdio) MCP tools are disabled by your organization's policy. ` +
                `An administrator can enable "Local MCP (desktop)" under Admin → Feature flags.`,
            );
          }
          if (!this.isLocalServerArmed(id)) {
            // v2 consent: file an owner-targeted approval request (Inbox)
            // before rejecting — approving it arms this server for 8h.
            this.requestLocalConsent(id, toolName);
            throw new Error(
              `Local tools for this connector are not enabled for this session. ` +
                `An approval request was sent to the connector owner's Inbox — approve it there, ` +
                `or open Settings → Connectors → this connector and click "Enable local tools for this session", then try again.`,
            );
          }
        }
        return client.callTool(toolName, input);
      })
      .map((res) => {
        if (isLocalStdio) {
          this.auditLocalToolCall(
            id,
            toolName,
            "success",
            Date.now() - startedAt,
          );
        }
        return res;
      })
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
        // Denied/failed local stdio calls are audited too (allowed AND denied
        // — ADR-0010 audit gate).
        if (isLocalStdio) {
          this.auditLocalToolCall(
            id,
            toolName,
            "error",
            Date.now() - startedAt,
          );
        }
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
