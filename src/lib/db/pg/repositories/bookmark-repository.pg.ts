import { and, eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { AgentTable, BookmarkTable } from "../schema.pg";

export interface BookmarkRepository {
  createBookmark(
    userId: string,
    itemId: string,
    itemType: "agent" | "workflow",
  ): Promise<void>;

  removeBookmark(
    userId: string,
    itemId: string,
    itemType: "agent" | "workflow",
  ): Promise<void>;

  toggleBookmark(
    userId: string,
    itemId: string,
    itemType: "agent" | "workflow",
    isCurrentlyBookmarked: boolean,
  ): Promise<boolean>;

  checkItemAccess(
    itemId: string,
    itemType: "agent" | "workflow",
    userId: string,
  ): Promise<boolean>;
}

export const pgBookmarkRepository: BookmarkRepository = {
  async createBookmark(userId, itemId, itemType) {
    await db
      .insert(BookmarkTable)
      .values({
        userId,
        itemId,
        itemType,
      })
      .onConflictDoNothing();
  },

  async removeBookmark(userId, itemId, itemType) {
    await db
      .delete(BookmarkTable)
      .where(
        and(
          eq(BookmarkTable.userId, userId),
          eq(BookmarkTable.itemId, itemId),
          eq(BookmarkTable.itemType, itemType),
        ),
      );
  },

  async toggleBookmark(userId, itemId, itemType, isCurrentlyBookmarked) {
    if (isCurrentlyBookmarked) {
      await this.removeBookmark(userId, itemId, itemType);
      return false;
    } else {
      await this.createBookmark(userId, itemId, itemType);
      return true;
    }
  },

  async checkItemAccess(itemId, itemType, userId) {
    if (itemType === "agent") {
      // Unified visibility model (docs/design/visibility-model.md): a user may
      // bookmark anything they can see — owner, org-wide values (modern
      // "company" + legacy "public"/"readonly"), a shared grant naming them,
      // or a team overlap. Same wiring as agent-repository's visibleToUser.
      const [agent] = await db
        .select({
          userId: AgentTable.userId,
          visibility: AgentTable.visibility,
          hasGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
            WHERE eg.entity_type = 'agent'
              AND eg.entity_id = ${AgentTable.id}
              AND eg.grantee_user_id = ${userId})`,
          inTeam: sql<boolean>`EXISTS (SELECT 1 FROM asafe_team_member tm
            WHERE tm.user_id = ${userId}
              AND ${AgentTable.teamIds} @> to_jsonb(ARRAY[tm.team_id::text]))`,
        })
        .from(AgentTable)
        .where(eq(AgentTable.id, itemId))
        .limit(1);

      if (!agent) return false;
      if (agent.userId === userId) return true;
      if (["company", "public", "readonly"].includes(agent.visibility)) {
        return true;
      }
      return agent.hasGrant || agent.inTeam;
    }

    // TODO: Add workflow access check when workflows support bookmarking
    return false;
  },
};
