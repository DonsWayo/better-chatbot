/**
 * @asafe-ai/desktop — local stdio MCP bridge scaffold
 *
 * Wave 10 v2 — NOT YET ENABLED.
 *
 * GATE: This module must NOT be imported from main.ts until:
 *   1. Security has signed off on acceptable local capabilities (ADR-0010)
 *   2. Server-side entitlement check API confirmed (ADR-0009: desktop:local-mcp)
 *   3. Per-action consent dialog implemented and reviewed
 *   4. Wave 7 guardrail filter wired on all tool inputs/outputs
 *   5. Audit logging wired to central sink
 *
 * Architecture: Option B (ADR-0010) — the desktop manages a set of stdio MCP
 * child processes. The renderer calls listTools / invokeTool via IPC; main.ts
 * checks entitlements, shows a consent dialog, guards through Wave 7, then
 * forwards to the appropriate child process.
 *
 * Diagram:
 *
 *   renderer (web UI)
 *     └─ contextBridge.listLocalTools / invokeLocalTool
 *          └─ ipcRenderer.invoke("mcp:…")
 *               └─ ipcMain.handle("mcp:…")          ← GATE: entitlement + consent + guardrail
 *                    └─ McpBridge.invoke(name, args)
 *                         └─ stdio child process
 *                              (server-filesystem / k8s-mcp / etc.)
 */

import { ChildProcess, spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// McpBridge — manages stdio child processes for local MCP servers
// ---------------------------------------------------------------------------

export class McpBridge {
  private processes = new Map<string, ChildProcess>();

  constructor(private readonly configs: McpServerConfig[]) {}

  /**
   * Start all configured MCP servers.
   * Call this after Security sign-off and entitlement check, not on app start.
   */
  async start(): Promise<void> {
    for (const cfg of this.configs) {
      if (this.processes.has(cfg.name)) continue;
      const child = spawn(cfg.command, cfg.args, {
        env: { ...process.env, ...cfg.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.on("error", (err) => {
        console.error(`[mcp-bridge] ${cfg.name} error:`, err);
        this.processes.delete(cfg.name);
      });
      child.on("exit", (code) => {
        console.info(`[mcp-bridge] ${cfg.name} exited with code ${code}`);
        this.processes.delete(cfg.name);
      });
      this.processes.set(cfg.name, child);
      console.info(`[mcp-bridge] Started: ${cfg.name}`);
    }
  }

  /** Stop all managed MCP child processes. */
  stop(): void {
    for (const [name, child] of this.processes) {
      child.kill("SIGTERM");
      console.info(`[mcp-bridge] Stopped: ${name}`);
    }
    this.processes.clear();
  }

  /**
   * List available tool descriptors from a named server.
   * Sends a JSON-RPC "tools/list" request over stdio.
   */
  async listTools(serverName: string): Promise<McpToolDescriptor[]> {
    const child = this.processes.get(serverName);
    if (!child) return [];
    return this._jsonRpc<McpToolDescriptor[]>(child, "tools/list", {});
  }

  /**
   * Invoke a tool on a named server.
   * MUST be called only after: entitlement check + consent dialog + guardrail filter.
   */
  async invokeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const child = this.processes.get(serverName);
    if (!child) throw new Error(`MCP server "${serverName}" is not running.`);
    return this._jsonRpc(child, "tools/call", { name: toolName, arguments: args });
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC over stdio (MCP wire protocol)
  // ---------------------------------------------------------------------------

  private _jsonRpc<T>(
    child: ChildProcess,
    method: string,
    params: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const request = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

      let buffer = "";

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as {
              id?: string;
              result?: T;
              error?: { message: string };
            };
            if (msg.id === id) {
              cleanup();
              if (msg.error) {
                reject(new Error(msg.error.message));
              } else {
                resolve(msg.result as T);
              }
            }
          } catch {
            // Non-JSON line — ignore (MCP servers sometimes emit log lines)
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        child.stdout?.removeListener("data", onData);
        child.removeListener("error", onError);
      };

      child.stdout?.on("data", onData);
      child.once("error", onError);

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`[mcp-bridge] JSON-RPC timeout for method: ${method}`));
      }, 30_000);

      child.once("exit", () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`[mcp-bridge] Child process exited during ${method}`));
      });

      child.stdin?.write(request);
    });
  }
}
