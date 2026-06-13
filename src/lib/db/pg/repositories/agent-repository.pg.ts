import { Agent, AgentRepository, AgentSummary } from "app-types/agent";
import { SQL, and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import { revokeAllGrants } from "lib/visibility";
import { pgDb as db } from "../db.pg";
import { AgentTable, BookmarkTable, UserTable } from "../schema.pg";

// Unified visibility model (docs/design/visibility-model.md). Org-wide values:
// modern "company" plus the legacy "public"/"readonly" still readable on
// unmigrated rows (migration 0041 rewrites public → company). "team"- and
// "shared"-stored rows are NOT org-wide — they are covered by the
// inSharedTeam / hasGrant EXISTS conditions below.
const ORG_WIDE_VISIBILITY = ["company", "public", "readonly"] as const;

const hasGrant = (userId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM entity_grant eg
        WHERE eg.entity_type = 'agent'
          AND eg.entity_id = ${AgentTable.id}
          AND eg.grantee_user_id = ${userId})`;

const inSharedTeam = (userId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM asafe_team_member tm
        WHERE tm.user_id = ${userId}
          AND ${AgentTable.teamIds} @> to_jsonb(ARRAY[tm.team_id::text]))`;

const visibleToUser = (userId: string): SQL | undefined =>
  or(
    inArray(AgentTable.visibility, [...ORG_WIDE_VISIBILITY]),
    hasGrant(userId),
    inSharedTeam(userId),
  );

export const pgAgentRepository: AgentRepository = {
  async insertAgent(agent) {
    const [result] = await db
      .insert(AgentTable)
      .values({
        id: generateUUID(),
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        userId: agent.userId,
        instructions: agent.instructions,
        visibility: agent.visibility || "private",
        teamIds: agent.teamIds ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
    };
  },

  async selectAgentById(id, userId): Promise<Agent | null> {
    const [result] = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        userId: AgentTable.userId,
        instructions: AgentTable.instructions,
        visibility: AgentTable.visibility,
        teamIds: AgentTable.teamIds,
        createdAt: AgentTable.createdAt,
        updatedAt: AgentTable.updatedAt,
        isBookmarked: sql<boolean>`${BookmarkTable.id} IS NOT NULL`,
      })
      .from(AgentTable)
      .leftJoin(
        BookmarkTable,
        and(
          eq(BookmarkTable.itemId, AgentTable.id),
          eq(BookmarkTable.userId, userId),
          eq(BookmarkTable.itemType, "agent"),
        ),
      )
      .where(
        and(
          eq(AgentTable.id, id),
          or(
            eq(AgentTable.userId, userId), // Own agent
            visibleToUser(userId), // public/readonly/shared-grant/team
          ),
        ),
      );

    if (!result) return null;

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      isBookmarked: result.isBookmarked ?? false,
    };
  },

  async selectAgentsByUserId(userId) {
    const results = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        userId: AgentTable.userId,
        instructions: AgentTable.instructions,
        visibility: AgentTable.visibility,
        createdAt: AgentTable.createdAt,
        updatedAt: AgentTable.updatedAt,
        userName: UserTable.name,
        userAvatar: UserTable.image,
        isBookmarked: sql<boolean>`false`,
      })
      .from(AgentTable)
      .innerJoin(UserTable, eq(AgentTable.userId, UserTable.id))
      .where(eq(AgentTable.userId, userId))
      .orderBy(desc(AgentTable.createdAt));

    // Map database nulls to undefined and set defaults for owned agents
    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
      isBookmarked: false, // Always false for owned agents
    }));
  },

  async updateAgent(id, userId, agent) {
    const [result] = await db
      .update(AgentTable)
      .set({
        ...agent,
        updatedAt: new Date(),
      })
      .where(
        and(
          // Only allow updates to agents owned by the user or org-wide
          // ("company", legacy "public") agents.
          eq(AgentTable.id, id),
          or(
            eq(AgentTable.userId, userId),
            inArray(AgentTable.visibility, ["company", "public"]),
          ),
        ),
      )
      .returning();

    // Reverting to "private" means owner-only: drop every entity_grant so a
    // formerly-shared agent stops leaking to its old grantees (the list query's
    // hasGrant() EXISTS would otherwise still match stale rows). Only fire when
    // an update actually landed (result is defined).
    if (result && agent.visibility === "private") {
      await revokeAllGrants("agent", id);
    }

    return {
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
    };
  },

  async deleteAgent(id, userId) {
    await db
      .delete(AgentTable)
      .where(and(eq(AgentTable.id, id), eq(AgentTable.userId, userId)));
  },

  async selectAgents(
    currentUserId,
    filters = ["all"],
    limit = 50,
  ): Promise<AgentSummary[]> {
    let orConditions: (SQL | undefined)[] = [];

    // Build OR conditions based on filters array
    for (const filter of filters) {
      if (filter === "mine") {
        orConditions.push(eq(AgentTable.userId, currentUserId));
      } else if (filter === "shared") {
        orConditions.push(
          and(
            ne(AgentTable.userId, currentUserId),
            visibleToUser(currentUserId),
          ),
        );
      } else if (filter === "bookmarked") {
        orConditions.push(
          and(
            ne(AgentTable.userId, currentUserId),
            visibleToUser(currentUserId),
            sql`${BookmarkTable.id} IS NOT NULL`,
          ),
        );
      } else if (filter === "all") {
        // All available agents (mine + shared) - this overrides other filters
        orConditions = [
          or(
            // My agents
            eq(AgentTable.userId, currentUserId),
            // Shared agents
            and(
              ne(AgentTable.userId, currentUserId),
              visibleToUser(currentUserId),
            ),
          ),
        ];
        break; // "all" overrides everything else
      }
    }

    const results = await db
      .select({
        id: AgentTable.id,
        name: AgentTable.name,
        description: AgentTable.description,
        icon: AgentTable.icon,
        userId: AgentTable.userId,
        // Exclude instructions from list queries for performance
        visibility: AgentTable.visibility,
        createdAt: AgentTable.createdAt,
        updatedAt: AgentTable.updatedAt,
        userName: UserTable.name,
        userAvatar: UserTable.image,
        isBookmarked: sql<boolean>`CASE WHEN ${BookmarkTable.id} IS NOT NULL THEN true ELSE false END`,
      })
      .from(AgentTable)
      .innerJoin(UserTable, eq(AgentTable.userId, UserTable.id))
      .leftJoin(
        BookmarkTable,
        and(
          eq(BookmarkTable.itemId, AgentTable.id),
          eq(BookmarkTable.itemType, "agent"),
          eq(BookmarkTable.userId, currentUserId),
        ),
      )
      .where(orConditions.length > 1 ? or(...orConditions) : orConditions[0])
      .orderBy(
        // My agents first, then other shared agents
        sql`CASE WHEN ${AgentTable.userId} = ${currentUserId} THEN 0 ELSE 1 END`,
        desc(AgentTable.createdAt),
      )
      .limit(limit);

    // Map database nulls to undefined
    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
    }));
  },

  async checkAccess(agentId, userId, destructive = false) {
    const [agent] = await db
      .select({
        visibility: AgentTable.visibility,
        userId: AgentTable.userId,
        hasGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
          WHERE eg.entity_type = 'agent'
            AND eg.entity_id = ${AgentTable.id}
            AND eg.grantee_user_id = ${userId})`,
        hasEditGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
          WHERE eg.entity_type = 'agent'
            AND eg.entity_id = ${AgentTable.id}
            AND eg.grantee_user_id = ${userId}
            AND eg.capability IN ('edit', 'manage'))`,
        inTeam: sql<boolean>`EXISTS (SELECT 1 FROM asafe_team_member tm
          WHERE tm.user_id = ${userId}
            AND ${AgentTable.teamIds} @> to_jsonb(ARRAY[tm.team_id::text]))`,
      })
      .from(AgentTable)
      .where(eq(AgentTable.id, agentId));
    if (!agent) {
      return false;
    }
    if (userId == agent.userId) return true;
    if (destructive) return agent.hasEditGrant;
    // Org-wide use: modern "company" or legacy "public" (rewritten to
    // "company" by migration 0041 but kept readable for back-compat).
    if (agent.visibility === "company" || agent.visibility === "public")
      return true;
    // "team"/"shared"/"private" (and legacy "readonly") rely on team
    // membership or an explicit grant.
    return agent.hasGrant || agent.inTeam;
  },
};
