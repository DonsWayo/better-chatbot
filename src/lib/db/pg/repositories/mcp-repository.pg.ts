import type { MCPRepository } from "app-types/mcp";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import { pgDb as db } from "../db.pg";
import { AsafeTeamMemberTable, McpServerTable, UserTable } from "../schema.pg";

export const pgMcpRepository: MCPRepository = {
  async save(server) {
    const [result] = await db
      .insert(McpServerTable)
      .values({
        id: server.id ?? generateUUID(),
        name: server.name,
        config: server.config,
        userId: server.userId,
        visibility: server.visibility ?? "private",
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [McpServerTable.id],
        set: {
          config: server.config,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  },

  async selectById(id) {
    const [result] = await db
      .select()
      .from(McpServerTable)
      .where(eq(McpServerTable.id, id));
    return result;
  },

  async selectAll() {
    const results = await db.select().from(McpServerTable);
    return results;
  },

  async selectAllForUser(userId) {
    // Resolve team IDs the user belongs to
    const teamMemberships = await db
      .select({ teamId: AsafeTeamMemberTable.teamId })
      .from(AsafeTeamMemberTable)
      .where(eq(AsafeTeamMemberTable.userId, userId));

    const userTeamIds = teamMemberships.map((m) => m.teamId);

    // Build visibility conditions:
    //   1. Personal servers owned by the user
    //   2. Org/featured public servers
    //   3. Team-scoped servers where the user is a team member (NEW)
    const visibilityConditions = [
      eq(McpServerTable.userId, userId),
      eq(McpServerTable.visibility, "public"),
      ...(userTeamIds.length > 0
        ? [
            and(
              eq(McpServerTable.scope, "team"),
              inArray(McpServerTable.teamId, userTeamIds),
            ),
          ]
        : []),
    ];

    const results = await db
      .select({
        id: McpServerTable.id,
        name: McpServerTable.name,
        config: McpServerTable.config,
        enabled: McpServerTable.enabled,
        userId: McpServerTable.userId,
        visibility: McpServerTable.visibility,
        lastConnectionStatus: McpServerTable.lastConnectionStatus,
        disabledTools: McpServerTable.disabledTools,
        createdAt: McpServerTable.createdAt,
        updatedAt: McpServerTable.updatedAt,
        userName: UserTable.name,
        userAvatar: UserTable.image,
      })
      .from(McpServerTable)
      .leftJoin(UserTable, eq(McpServerTable.userId, UserTable.id))
      .where(or(...visibilityConditions))
      .orderBy(desc(McpServerTable.createdAt));
    return results;
  },

  async updateVisibility(id, visibility) {
    await db
      .update(McpServerTable)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(McpServerTable.id, id));
  },

  async deleteById(id) {
    await db.delete(McpServerTable).where(eq(McpServerTable.id, id));
  },

  async selectByServerName(name) {
    const [result] = await db
      .select()
      .from(McpServerTable)
      .where(eq(McpServerTable.name, name));
    return result;
  },
  async updateToolInfo(id, toolInfo) {
    await db
      .update(McpServerTable)
      .set({
        toolInfo,
        toolInfoUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(McpServerTable.id, id));
  },

  async updateDisabledTools(id, disabledTools) {
    await db
      .update(McpServerTable)
      .set({
        disabledTools,
        updatedAt: new Date(),
      })
      .where(eq(McpServerTable.id, id));
  },

  async updateConnectionStatus(id, status) {
    await db
      .update(McpServerTable)
      .set({
        lastConnectionStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(McpServerTable.id, id));
  },

  async existsByServerName(name) {
    const [result] = await db
      .select({ id: McpServerTable.id })
      .from(McpServerTable)
      .where(eq(McpServerTable.name, name));

    return !!result;
  },
};
