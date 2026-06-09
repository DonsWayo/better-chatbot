import "server-only";

import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { createMCPClient } from "lib/ai/mcp/create-mcp-client";
import { generateUUID } from "lib/utils";

export interface McpConnectionTestResult {
  /** True when the handshake succeeded and tools were listed. */
  ok: boolean;
  /** Number of tools the server advertised (only when ok). */
  toolCount?: number;
  /** Tool metadata captured during the probe (only when ok). */
  toolInfo?: MCPToolInfo[];
  /** True when the server reachable but requires OAuth/SSO authorization. */
  needsAuth?: boolean;
  /** Human-readable failure reason (only when !ok). */
  error?: string;
}

/**
 * Actively probe an MCP server: open a real connection, complete the MCP
 * handshake, and list its tools. Returns a structured result instead of
 * throwing — callers (e.g. the admin "Register Server" flow) use it to confirm
 * a server actually works before/after persisting it.
 *
 * Best-effort and self-contained: always disconnects, never leaks a client.
 */
export async function testMcpServerConnection(
  config: MCPServerConfig,
): Promise<McpConnectionTestResult> {
  const client = createMCPClient(`probe-${generateUUID()}`, "probe", config, {
    autoDisconnectSeconds: 1,
  });

  try {
    await client.connect();
    const status = client.status;

    if (status === "authorizing") {
      return {
        ok: false,
        needsAuth: true,
        error:
          "Server requires OAuth/SSO authorization. Saved — connect it from the server's authorize action.",
      };
    }

    if (status !== "connected") {
      return { ok: false, error: `Connection status: ${status}` };
    }

    const toolInfo = client.toolInfo ?? [];
    return { ok: true, toolCount: toolInfo.length, toolInfo };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}
