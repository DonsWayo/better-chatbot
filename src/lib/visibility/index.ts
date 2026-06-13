import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AgentTable,
  AsafeKnowledgeCollectionTable,
  EntityGrantTable,
  UserTable,
  WorkflowTable,
} from "lib/db/pg/schema.pg";
import { listUserTeams } from "lib/teamspaces/folders";
import { getIsUserAdmin } from "lib/user/utils";

/**
 * Unified visibility & sharing model — docs/design/visibility-model.md.
 *
 * One mental model for EVERY shareable entity:
 *
 * | visibility | who can view/use            | who can edit/manage |
 * |------------|-----------------------------|----------------------|
 * | private    | owner only                  | owner (+ admins)     |
 * | shared     | per-grant (entity_grant)    | per-grant ≥ edit     |
 * | team       | members of any teamIds[]    | owner (+ admins)     |
 * | company    | everyone in the org         | owner (+ admins)     |
 *
 * Orthogonal capability axis: view < use < edit < manage. A grant of a higher
 * capability implies every lower one (manage ⊇ edit ⊇ use ⊇ view).
 *
 * Owner and org admins ALWAYS have manage, regardless of visibility.
 *
 * Legacy mapping (resolver-level — NO data migration): the old
 * "public" | "private" | "readonly" enums on workflow/agent keep living in
 * the DB. "public" resolves as company; "readonly" resolves as company capped
 * at view for non-owners; "private" (and anything unknown) as private.
 *
 * Entitlements still apply on top: visibility never bypasses model
 * allow-lists, tool gates, budgets, or guardrails.
 */

export type Visibility = "private" | "shared" | "team" | "company";
export type Capability = "view" | "use" | "edit" | "manage";

/** Entity types that can carry entity_grant rows (mirrors the DB enum). */
export type GrantableEntityType =
  | "workflow"
  | "agent"
  | "thread"
  | "folder"
  | "knowledge_collection"
  | "mcp_server";

const CAPABILITY_RANK: Record<Capability, number> = {
  view: 0,
  use: 1,
  edit: 2,
  manage: 3,
};

const MODERN_VISIBILITIES: ReadonlySet<string> = new Set([
  "private",
  "shared",
  "team",
  "company",
]);

export interface VisibilityEntity {
  ownerId: string;
  /** Modern four-level visibility, when the entity already stores it. */
  visibility?: string | null;
  /** Teams the entity is shared with at "team" level. null/[] = none. */
  teamIds?: string[] | null;
  /**
   * Raw legacy visibility value ("public" | "private" | "readonly") for
   * entities that have not migrated their enum yet. Used only when
   * `visibility` is absent or not one of the four modern levels.
   */
  legacyVisibility?: string | null;
}

export interface ViewerContext {
  userId: string;
  /** Team IDs the viewer belongs to. */
  userTeamIds: string[];
  /** Org-level admin (user.role contains "admin"). */
  isAdmin: boolean;
  /** The viewer's entity_grant rows for THIS entity. */
  grants: Array<{ capability: Capability }>;
}

interface EffectiveVisibility {
  level: Visibility;
  /** Cap applied to non-owners (legacy "readonly" → view-only company). */
  maxCapability: Capability;
}

function normalizeVisibility(
  visibility: string | null | undefined,
  legacyVisibility: string | null | undefined,
): EffectiveVisibility {
  if (visibility && MODERN_VISIBILITIES.has(visibility)) {
    return { level: visibility as Visibility, maxCapability: "use" };
  }
  // Fall back to the legacy enum (also accepts legacy values passed directly
  // in `visibility`, e.g. when canAccess forwards an unmigrated column).
  const legacy = legacyVisibility ?? visibility ?? null;
  switch (legacy) {
    case "public":
      return { level: "company", maxCapability: "use" };
    // Legacy knowledge-collection enum value: "org" meant org-wide → company.
    case "org":
      return { level: "company", maxCapability: "use" };
    case "readonly":
      return { level: "company", maxCapability: "view" };
    default:
      // legacy "private", null, unknown → private (fail closed).
      return { level: "private", maxCapability: "use" };
  }
}

/**
 * Pure access resolver. True iff `viewer` holds `capability` on `entity`.
 *
 * Rules (in order):
 * 1. Owner and org admins always have manage (thus everything).
 * 2. company → everyone may view/use; edit/manage stays owner+admin.
 * 3. team → members of ANY of entity.teamIds may view/use.
 * 4. shared → the viewer's best grant decides (manage > edit > use > view).
 * 5. private → nobody else, ever.
 */
export function resolveAccess(
  entity: VisibilityEntity,
  viewer: ViewerContext,
  capability: Capability,
): boolean {
  if (viewer.userId === entity.ownerId) return true;
  if (viewer.isAdmin) return true;

  const needed = CAPABILITY_RANK[capability];
  const { level, maxCapability } = normalizeVisibility(
    entity.visibility,
    entity.legacyVisibility,
  );

  switch (level) {
    case "company":
      return needed <= CAPABILITY_RANK[maxCapability];
    case "team": {
      const teamIds = entity.teamIds ?? [];
      if (teamIds.length === 0) return false;
      const member = teamIds.some((id) => viewer.userTeamIds.includes(id));
      return member && needed <= CAPABILITY_RANK.use;
    }
    case "shared": {
      const best = viewer.grants.reduce(
        (max, g) => Math.max(max, CAPABILITY_RANK[g.capability] ?? -1),
        -1,
      );
      return best >= needed;
    }
    default:
      // private
      return false;
  }
}

// ── DB-backed resolution ─────────────────────────────────────────────────────

/**
 * Load the visibility-relevant slice of an entity. Only workflow + agent are
 * wired in this round; the remaining types resolve to null (→ no access)
 * until their rounds land.
 */
async function loadEntity(
  entityType: GrantableEntityType,
  entityId: string,
): Promise<VisibilityEntity | null> {
  switch (entityType) {
    case "workflow": {
      const [row] = await db
        .select({
          ownerId: WorkflowTable.userId,
          visibility: WorkflowTable.visibility,
          teamIds: WorkflowTable.teamIds,
        })
        .from(WorkflowTable)
        .where(eq(WorkflowTable.id, entityId))
        .limit(1);
      if (!row) return null;
      // The raw column goes in `visibility`: modern values pass through and
      // legacy "public"/"readonly" fall back to the legacy mapping, so the
      // resolver keeps working before AND after the enum widens.
      return {
        ownerId: row.ownerId,
        visibility: row.visibility,
        teamIds: row.teamIds ?? null,
      };
    }
    case "agent": {
      const [row] = await db
        .select({
          ownerId: AgentTable.userId,
          visibility: AgentTable.visibility,
          teamIds: AgentTable.teamIds,
        })
        .from(AgentTable)
        .where(eq(AgentTable.id, entityId))
        .limit(1);
      if (!row) return null;
      return {
        ownerId: row.ownerId,
        visibility: row.visibility,
        teamIds: row.teamIds ?? null,
      };
    }
    case "knowledge_collection": {
      const [row] = await db
        .select({
          ownerId: AsafeKnowledgeCollectionTable.createdBy,
          visibility: AsafeKnowledgeCollectionTable.visibility,
          teamIds: AsafeKnowledgeCollectionTable.teamIds,
          teamId: AsafeKnowledgeCollectionTable.teamId,
        })
        .from(AsafeKnowledgeCollectionTable)
        .where(eq(AsafeKnowledgeCollectionTable.id, entityId))
        .limit(1);
      if (!row) return null;
      return knowledgeCollectionEntity(row);
    }
    default:
      // TODO(visibility): wire thread, folder and mcp_server loaders in
      // their migration rounds (they keep their existing bespoke checks
      // until then). Fail closed meanwhile.
      return null;
  }
}

/**
 * Map a knowledge-collection row to the resolver's entity shape. Legacy rows
 * carry a single `teamId` (and visibility "org" / "team") — fall back to it
 * when the modern `teamIds[]` is empty. `createdBy` is nullable (creator
 * deleted): ownership then matches nobody, but visibility still applies.
 */
export function knowledgeCollectionEntity(row: {
  createdBy?: string | null;
  ownerId?: string | null;
  visibility: string | null;
  teamIds?: string[] | null;
  teamId?: string | null;
}): VisibilityEntity {
  const teamIds = row.teamIds?.length
    ? row.teamIds
    : row.teamId
      ? [row.teamId]
      : null;
  return {
    ownerId: row.ownerId ?? row.createdBy ?? "",
    visibility: row.visibility,
    teamIds,
  };
}

/**
 * Viewer context for filtering LISTS of one entity type in a single pass:
 * one user lookup, one team lookup, one grants query (all grants the user
 * holds on that entity type, keyed by entity id). Combine with resolveAccess
 * per row.
 */
export interface ViewerListContext {
  userId: string;
  userTeamIds: string[];
  isAdmin: boolean;
  grantsByEntityId: Record<string, Array<{ capability: Capability }>>;
}

export async function loadViewerContext(
  entityType: GrantableEntityType,
  userId: string,
): Promise<ViewerListContext> {
  const [userRows, teams, grants] = await Promise.all([
    db
      .select({ role: UserTable.role })
      .from(UserTable)
      .where(eq(UserTable.id, userId))
      .limit(1),
    listUserTeams(userId),
    db
      .select({
        entityId: EntityGrantTable.entityId,
        capability: EntityGrantTable.capability,
      })
      .from(EntityGrantTable)
      .where(
        and(
          eq(EntityGrantTable.entityType, entityType),
          eq(EntityGrantTable.granteeUserId, userId),
        ),
      ),
  ]);

  const grantsByEntityId: Record<
    string,
    Array<{ capability: Capability }>
  > = {};
  for (const g of grants) {
    (grantsByEntityId[g.entityId] ??= []).push({ capability: g.capability });
  }

  return {
    userId,
    userTeamIds: teams.map((t) => t.id),
    isAdmin: getIsUserAdmin({ role: userRows[0]?.role ?? null }),
    grantsByEntityId,
  };
}

/**
 * DB-backed gate: does `userId` hold `capability` on the given entity?
 * Loads the entity, the user's admin flag, team memberships and grants, then
 * delegates to resolveAccess. Unknown entity (or unwired type) → false.
 */
export async function canAccess(
  entityType: GrantableEntityType,
  entityId: string,
  userId: string,
  capability: Capability,
): Promise<boolean> {
  const entity = await loadEntity(entityType, entityId);
  if (!entity) return false;

  const [userRows, teams, grants] = await Promise.all([
    db
      .select({ role: UserTable.role })
      .from(UserTable)
      .where(eq(UserTable.id, userId))
      .limit(1),
    listUserTeams(userId),
    db
      .select({ capability: EntityGrantTable.capability })
      .from(EntityGrantTable)
      .where(
        and(
          eq(EntityGrantTable.entityType, entityType),
          eq(EntityGrantTable.entityId, entityId),
          eq(EntityGrantTable.granteeUserId, userId),
        ),
      ),
  ]);

  return resolveAccess(
    entity,
    {
      userId,
      userTeamIds: teams.map((t) => t.id),
      isAdmin: getIsUserAdmin({ role: userRows[0]?.role ?? null }),
      grants,
    },
    capability,
  );
}

// ── grant management ─────────────────────────────────────────────────────────

export interface EntityGrant {
  id: string;
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability: Capability;
  grantedBy: string;
  createdAt: Date;
}

/**
 * Idempotent upsert: granting the same (entity, grantee, capability) twice is
 * a no-op (UNIQUE constraint + ON CONFLICT DO NOTHING).
 */
export async function grantAccess(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability: Capability;
  grantedBy: string;
}): Promise<void> {
  await db
    .insert(EntityGrantTable)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      granteeUserId: input.granteeUserId,
      capability: input.capability,
      grantedBy: input.grantedBy,
    })
    .onConflictDoNothing({
      target: [
        EntityGrantTable.entityType,
        EntityGrantTable.entityId,
        EntityGrantTable.granteeUserId,
        EntityGrantTable.capability,
      ],
    });
}

/**
 * Revoke a grant. When `capability` is omitted, ALL of the grantee's grants
 * on the entity are removed.
 */
export async function revokeAccess(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability?: Capability;
}): Promise<void> {
  await db
    .delete(EntityGrantTable)
    .where(
      and(
        eq(EntityGrantTable.entityType, input.entityType),
        eq(EntityGrantTable.entityId, input.entityId),
        eq(EntityGrantTable.granteeUserId, input.granteeUserId),
        input.capability
          ? eq(EntityGrantTable.capability, input.capability)
          : undefined,
      ),
    );
}

/**
 * Revoke EVERY grant on an entity, for all grantees. Called whenever an
 * entity's visibility is reset to "private": private means owner-only, so any
 * lingering entity_grant rows would otherwise keep leaking the entity to its
 * former grantees (e.g. a now-private agent still LISTING for editor2 because
 * the list query's hasGrant() EXISTS still matched a stale row). Idempotent:
 * a no-op when the entity has no grants.
 */
export async function revokeAllGrants(
  entityType: GrantableEntityType,
  entityId: string,
): Promise<void> {
  await db
    .delete(EntityGrantTable)
    .where(
      and(
        eq(EntityGrantTable.entityType, entityType),
        eq(EntityGrantTable.entityId, entityId),
      ),
    );
}

/**
 * Resolve a user by email for the "shared" grant manager UI. Returns the
 * minimal identity the picker needs (id + display name) or null when no user
 * owns that email. Case-insensitive on the local convention that emails are
 * stored lower-cased; we normalize defensively.
 */
export async function resolveGranteeByEmail(
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select({
      id: UserTable.id,
      name: UserTable.name,
      email: UserTable.email,
    })
    .from(UserTable)
    .where(eq(UserTable.email, normalized))
    .limit(1);
  return row ?? null;
}

/** Resolve the display names for a set of grantee user ids (grant list UI). */
export async function resolveGranteeNames(
  userIds: string[],
): Promise<Record<string, { name: string; email: string }>> {
  if (userIds.length === 0) return {};
  const rows = await db
    .select({
      id: UserTable.id,
      name: UserTable.name,
      email: UserTable.email,
    })
    .from(UserTable)
    .where(inArray(UserTable.id, userIds));
  return Object.fromEntries(
    rows.map((r) => [r.id, { name: r.name, email: r.email }]),
  );
}

/** Every grant on an entity (for the sharing UI's grant list). */
export async function listGrants(
  entityType: GrantableEntityType,
  entityId: string,
): Promise<EntityGrant[]> {
  const rows = await db
    .select()
    .from(EntityGrantTable)
    .where(
      and(
        eq(EntityGrantTable.entityType, entityType),
        eq(EntityGrantTable.entityId, entityId),
      ),
    );
  return rows as EntityGrant[];
}
