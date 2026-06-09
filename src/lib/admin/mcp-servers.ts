import "server-only";

import type { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { and, eq, inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { McpServerTable } from "lib/db/pg/schema.pg";

export interface RegisterMcpServerInput {
  name: string;
  scope: "org" | "team";
  /** One or more teams a team-scoped server is shared with. */
  teamIds?: string[] | null;
  config: MCPServerConfig;
  enabled: boolean;
  userId: string;
  /** Connection-probe outcome captured at registration time. */
  lastConnectionStatus?: "connected" | "error" | null;
  toolInfo?: MCPToolInfo[] | null;
}

export interface PatchMcpServerInput {
  name?: string;
  enabled?: boolean;
  scope?: "org" | "team";
  teamIds?: string[] | null;
}

export async function registerMcpServer(input: RegisterMcpServerInput) {
  const teamIds =
    input.scope === "team" ? (input.teamIds ?? []).filter(Boolean) : null;
  const [server] = await db
    .insert(McpServerTable)
    .values({
      name: input.name,
      scope: input.scope,
      // Keep the legacy single column in sync with the first team.
      teamId: teamIds && teamIds.length > 0 ? teamIds[0] : null,
      teamIds: teamIds && teamIds.length > 0 ? teamIds : null,
      config: input.config,
      enabled: input.enabled,
      userId: input.userId,
      lastConnectionStatus: input.lastConnectionStatus ?? null,
      toolInfo: input.toolInfo ?? null,
      toolInfoUpdatedAt: input.toolInfo ? new Date() : null,
    })
    .returning();
  return server;
}

export async function updateMcpServer(id: string, patch: PatchMcpServerInput) {
  const { teamIds, ...rest } = patch;
  const teamSync =
    teamIds !== undefined
      ? {
          teamIds: teamIds && teamIds.length > 0 ? teamIds : null,
          teamId: teamIds && teamIds.length > 0 ? teamIds[0] : null,
        }
      : {};
  const [updated] = await db
    .update(McpServerTable)
    .set({ ...rest, ...teamSync, updatedAt: new Date() })
    .where(
      and(
        eq(McpServerTable.id, id),
        inArray(McpServerTable.scope, ["org", "team"]),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function deleteMcpServer(id: string): Promise<string | null> {
  const [deleted] = await db
    .delete(McpServerTable)
    .where(
      and(
        eq(McpServerTable.id, id),
        inArray(McpServerTable.scope, ["org", "team"]),
      ),
    )
    .returning({ id: McpServerTable.id });
  return deleted?.id ?? null;
}
