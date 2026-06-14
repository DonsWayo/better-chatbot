import { SQL, and, desc, eq, ne, or, sql } from "drizzle-orm";
import { revokeAllGrants } from "lib/visibility";
import { pgDb as db } from "../db.pg";
import {
  AsafeDocumentRevisionTable,
  AsafeDocumentTable,
  AsafeTeamMemberTable,
  UserTable,
} from "../schema.pg";

/**
 * Collaborative-document repository. Governed by the unified visibility model
 * (docs/design/visibility-model.md) exactly like agent-/workflow-repository:
 *
 *   - owner + org admins always manage;
 *   - "company"           → everyone may read;
 *   - "team"              → members of teamId may read (inSharedTeam fragment);
 *   - "shared"            → per-user entity_grant (hasGrant / hasEditGrant);
 *   - "private"           → owner only, and reverting to it revokeAllGrants()s
 *                           so a formerly-shared doc stops leaking.
 *
 * Documents are personal/collaborative content (like chat threads), so ALL
 * authenticated users may create + edit their OWN docs — creation is NOT gated
 * behind an editor/admin role. Edit access by a non-owner requires an
 * edit/manage grant (readOnly=false in checkAccess).
 *
 * Realtime is near-live over Electric (single-author soft-lock /
 * last-write-wins): the Electric shape exposes only a CHANGE SIGNAL, never the
 * heavy `content` jsonb.
 */

const ENTITY_TYPE = "document" as const;

const hasGrant = (userId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM entity_grant eg
        WHERE eg.entity_type = ${ENTITY_TYPE}
          AND eg.entity_id = ${AsafeDocumentTable.id}
          AND eg.grantee_user_id = ${userId})`;

const inSharedTeam = (userId: string): SQL =>
  sql`(${AsafeDocumentTable.teamId} IS NOT NULL
        AND EXISTS (SELECT 1 FROM asafe_team_member tm
          WHERE tm.user_id = ${userId}
            AND tm.team_id = ${AsafeDocumentTable.teamId}))`;

/** A doc is visible to a non-owner via company / team / per-user grant. */
const visibleToUser = (userId: string): SQL | undefined =>
  or(
    eq(AsafeDocumentTable.visibility, "company"),
    and(eq(AsafeDocumentTable.visibility, "team"), inSharedTeam(userId)),
    hasGrant(userId),
  );

export interface DocumentSummary {
  id: string;
  title: string;
  userId: string;
  teamId: string | null;
  visibility: string;
  updatedAt: Date;
  createdAt: Date;
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
  archived: boolean;
  ownerName?: string;
  ownerAvatar?: string;
}

export type DocumentEntity = typeof AsafeDocumentTable.$inferSelect;
export type DocumentRevisionEntity =
  typeof AsafeDocumentRevisionTable.$inferSelect;

const EMPTY_DOC = { type: "doc", content: [] };

export const pgDocumentRepository = {
  async createDocument(input: {
    userId: string;
    teamId?: string | null;
    title?: string;
    visibility?: "private" | "shared" | "team" | "company";
    content?: Record<string, unknown>;
  }): Promise<DocumentEntity> {
    const [doc] = await db
      .insert(AsafeDocumentTable)
      .values({
        userId: input.userId,
        teamId: input.teamId ?? null,
        title: input.title?.trim() || "Untitled",
        visibility: input.visibility ?? "private",
        content: input.content ?? EMPTY_DOC,
      })
      .returning();
    return doc;
  },

  /** Full row incl. content, owner + visibility fields. No ACL — callers gate. */
  async getDocumentById(id: string): Promise<DocumentEntity | null> {
    const [doc] = await db
      .select()
      .from(AsafeDocumentTable)
      .where(eq(AsafeDocumentTable.id, id))
      .limit(1);
    return doc ?? null;
  },

  /**
   * Does `userId` hold read (readOnly=true) or manage/edit (readOnly=false)
   * access on the doc? Mirrors agentRepository.checkAccess:
   *   - owner → always true;
   *   - org admin → always true;
   *   - readOnly: company OR (team && member) OR any grant;
   *   - !readOnly (manage/edit): owner/admin only, or an edit/manage grant.
   */
  async checkAccess(
    id: string,
    userId: string,
    readOnly = true,
  ): Promise<boolean> {
    // The grant / team / admin EXISTS subqueries bind `id`/`teamId` as VALUES
    // (not a correlated column reference): a bare `${AsafeDocumentTable.id}`
    // inside a raw sql`` template renders unqualified as "id", which Postgres
    // resolves to entity_grant.id in the subquery's scope — silently matching
    // nothing. We already have `id` (and select teamId) here, so bind them.
    const [row] = await db
      .select({
        userId: AsafeDocumentTable.userId,
        visibility: AsafeDocumentTable.visibility,
        teamId: AsafeDocumentTable.teamId,
        isAdmin: sql<boolean>`EXISTS (SELECT 1 FROM "user" u
          WHERE u.id = ${userId} AND u.role = 'admin')`,
        hasGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
          WHERE eg.entity_type = ${ENTITY_TYPE}
            AND eg.entity_id = ${id}
            AND eg.grantee_user_id = ${userId})`,
        hasEditGrant: sql<boolean>`EXISTS (SELECT 1 FROM entity_grant eg
          WHERE eg.entity_type = ${ENTITY_TYPE}
            AND eg.entity_id = ${id}
            AND eg.grantee_user_id = ${userId}
            AND eg.capability IN ('edit', 'manage'))`,
      })
      .from(AsafeDocumentTable)
      .where(eq(AsafeDocumentTable.id, id))
      .limit(1);
    if (!row) return false;
    if (row.userId === userId) return true;
    if (row.isAdmin) return true;
    if (!readOnly) {
      // edit/manage: only owner/admin (handled above) or an edit/manage grant.
      return row.hasEditGrant;
    }
    // read: company, or team-visible to a member, or any grant.
    if (row.visibility === "company") return true;
    if (row.visibility === "team" && row.teamId) {
      const [member] = await db
        .select({ ok: sql<boolean>`true` })
        .from(AsafeTeamMemberTable)
        .where(
          and(
            eq(AsafeTeamMemberTable.userId, userId),
            eq(AsafeTeamMemberTable.teamId, row.teamId),
          ),
        )
        .limit(1);
      if (member?.ok) return true;
    }
    return row.hasGrant;
  },

  /**
   * Documents the user can see: their own + accessible company/team/shared
   * docs. Mirrors selectAgents' hasGrant EXISTS + team-membership fragment.
   */
  async listDocumentsForUser(
    userId: string,
    limit = 100,
  ): Promise<DocumentSummary[]> {
    const rows = await db
      .select({
        id: AsafeDocumentTable.id,
        title: AsafeDocumentTable.title,
        userId: AsafeDocumentTable.userId,
        teamId: AsafeDocumentTable.teamId,
        visibility: AsafeDocumentTable.visibility,
        updatedAt: AsafeDocumentTable.updatedAt,
        createdAt: AsafeDocumentTable.createdAt,
        lastEditedBy: AsafeDocumentTable.lastEditedBy,
        lastEditedAt: AsafeDocumentTable.lastEditedAt,
        archived: AsafeDocumentTable.archived,
        ownerName: UserTable.name,
        ownerAvatar: UserTable.image,
      })
      .from(AsafeDocumentTable)
      .innerJoin(UserTable, eq(AsafeDocumentTable.userId, UserTable.id))
      .where(
        or(
          eq(AsafeDocumentTable.userId, userId),
          and(ne(AsafeDocumentTable.userId, userId), visibleToUser(userId)),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${AsafeDocumentTable.userId} = ${userId} THEN 0 ELSE 1 END`,
        desc(AsafeDocumentTable.updatedAt),
      )
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      ownerName: r.ownerName ?? undefined,
      ownerAvatar: r.ownerAvatar ?? undefined,
    }));
  },

  /**
   * Autosave path: update title/content, bump updatedAt + lastEditedBy/At.
   * Caller MUST hold manage/edit (checkAccess(readOnly=false)) — enforced here.
   * Throws "Forbidden" when the caller lacks edit access.
   */
  async updateDocument(
    id: string,
    patch: { title?: string; content?: Record<string, unknown> },
    userId: string,
  ): Promise<DocumentEntity> {
    if (!(await this.checkAccess(id, userId, false))) {
      throw new Error("Forbidden");
    }
    const now = new Date();
    const set: Partial<typeof AsafeDocumentTable.$inferInsert> = {
      updatedAt: now,
      lastEditedBy: userId,
      lastEditedAt: now,
    };
    if (patch.title !== undefined) set.title = patch.title.trim() || "Untitled";
    if (patch.content !== undefined) set.content = patch.content;

    const [updated] = await db
      .update(AsafeDocumentTable)
      .set(set)
      .where(eq(AsafeDocumentTable.id, id))
      .returning();
    return updated;
  },

  async renameDocument(
    id: string,
    title: string,
    userId: string,
  ): Promise<DocumentEntity> {
    return this.updateDocument(id, { title }, userId);
  },

  /**
   * Change visibility. Requires manage/edit. Reverting to "private" revokes
   * every grant on the doc (the known leak class — owner-only means no lingering
   * entity_grant rows keep listing it for old grantees).
   */
  async setVisibility(
    id: string,
    visibility: "private" | "shared" | "team" | "company",
    userId: string,
    teamId?: string | null,
  ): Promise<DocumentEntity> {
    if (!(await this.checkAccess(id, userId, false))) {
      throw new Error("Forbidden");
    }
    const set: Partial<typeof AsafeDocumentTable.$inferInsert> = {
      visibility,
      updatedAt: new Date(),
    };
    if (teamId !== undefined) set.teamId = teamId;
    const [updated] = await db
      .update(AsafeDocumentTable)
      .set(set)
      .where(eq(AsafeDocumentTable.id, id))
      .returning();

    if (visibility === "private") {
      await revokeAllGrants(ENTITY_TYPE, id);
    }
    return updated;
  },

  /** Delete a doc. Requires manage/edit (owner/admin or edit/manage grant). */
  async deleteDocument(id: string, userId: string): Promise<void> {
    if (!(await this.checkAccess(id, userId, false))) {
      throw new Error("Forbidden");
    }
    await db.delete(AsafeDocumentTable).where(eq(AsafeDocumentTable.id, id));
  },

  /**
   * Snapshot the current doc state into the revision history. Requires
   * manage/edit. Returns the created revision.
   */
  async createRevision(
    documentId: string,
    userId: string,
  ): Promise<DocumentRevisionEntity> {
    if (!(await this.checkAccess(documentId, userId, false))) {
      throw new Error("Forbidden");
    }
    const doc = await this.getDocumentById(documentId);
    if (!doc) throw new Error("Document not found");
    const [rev] = await db
      .insert(AsafeDocumentRevisionTable)
      .values({
        documentId,
        title: doc.title,
        content: doc.content,
        editedBy: userId,
      })
      .returning();
    return rev;
  },

  /** Version history for a doc, newest first. */
  async listRevisions(
    documentId: string,
    limit = 50,
  ): Promise<DocumentRevisionEntity[]> {
    return db
      .select()
      .from(AsafeDocumentRevisionTable)
      .where(eq(AsafeDocumentRevisionTable.documentId, documentId))
      .orderBy(desc(AsafeDocumentRevisionTable.createdAt))
      .limit(limit);
  },

  /**
   * Restore a past revision: snapshot the current state first (so restore is
   * itself undoable), then overwrite title/content from the revision. Requires
   * manage/edit. Returns the restored document.
   */
  async restoreRevision(
    documentId: string,
    revisionId: string,
    userId: string,
  ): Promise<DocumentEntity> {
    if (!(await this.checkAccess(documentId, userId, false))) {
      throw new Error("Forbidden");
    }
    const [rev] = await db
      .select()
      .from(AsafeDocumentRevisionTable)
      .where(
        and(
          eq(AsafeDocumentRevisionTable.id, revisionId),
          eq(AsafeDocumentRevisionTable.documentId, documentId),
        ),
      )
      .limit(1);
    if (!rev) throw new Error("Revision not found");

    // Snapshot current state before overwriting.
    await this.createRevision(documentId, userId);

    const now = new Date();
    const [restored] = await db
      .update(AsafeDocumentTable)
      .set({
        title: rev.title,
        content: rev.content,
        updatedAt: now,
        lastEditedBy: userId,
        lastEditedAt: now,
      })
      .where(eq(AsafeDocumentTable.id, documentId))
      .returning();
    return restored;
  },
};

export type DocumentRepository = typeof pgDocumentRepository;
