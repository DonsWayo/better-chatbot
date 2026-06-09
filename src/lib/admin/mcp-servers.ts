import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import { McpServerTable } from "lib/db/pg/schema.pg";
import { eq, and, inArray } from "drizzle-orm";
import type { MCPServerConfig } from "app-types/mcp";

export interface RegisterMcpServerInput {
  name: string;
  scope: "org" | "team";
  teamId?: string | null;
  config: MCPServerConfig;
  enabled: boolean;
  userId: string;
}

export interface PatchMcpServerInput {
  name?: string;
  enabled?: boolean;
  scope?: "org" | "team";
  teamId?: string | null;
}

export async function registerMcpServer(input: RegisterMcpServerInput) {
  const [server] = await db
    .insert(McpServerTable)
    .values({
      name: input.name,
      scope: input.scope,
      teamId: input.teamId ?? null,
      config: input.config,
      enabled: input.enabled,
      userId: input.userId,
    })
    .returning();
  return server;
}

export async function updateMcpServer(id: string, patch: PatchMcpServerInput) {
  const [updated] = await db
    .update(McpServerTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(McpServerTable.id, id), inArray(McpServerTable.scope, ["org", "team"])))
    .returning();
  return updated ?? null;
}

export async function deleteMcpServer(id: string): Promise<string | null> {
  const [deleted] = await db
    .delete(McpServerTable)
    .where(and(eq(McpServerTable.id, id), inArray(McpServerTable.scope, ["org", "team"])))
    .returning({ id: McpServerTable.id });
  return deleted?.id ?? null;
}
