import { and, asc, eq } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { AsafeDocumentCommentTable, UserTable } from "../schema.pg";

/**
 * Threaded comments on collaborative documents. Mirrors the chat-export comment
 * repository (src/lib/db/pg/repositories/chat-export-repository.pg.ts) but the
 * ACL is the document's, not a public export's:
 *
 *   - LIST / CREATE: anyone who can READ the doc (checkAccess readOnly=true) —
 *     enforced by the calling Server Action via documentRepository.checkAccess;
 *   - DELETE: the comment author, or an org admin (the action passes an
 *     `allowAnyAuthor` flag once it has verified admin).
 *
 * Realtime is POLLING (the panel re-fetches while OPEN + visible), never an
 * Electric shape, so a closed panel holds no connection — network-idle-safe.
 */

export interface DocumentCommentWithUser {
  id: string;
  documentId: string;
  parentId: string | null;
  authorId: string;
  content: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
  authorImage?: string;
  isOwner?: boolean;
  replies?: DocumentCommentWithUser[];
}

export const pgDocumentCommentRepository = {
  async insertComment(input: {
    documentId: string;
    authorId: string;
    parentId?: string | null;
    content: Record<string, unknown>;
  }): Promise<DocumentCommentWithUser> {
    const [row] = await db
      .insert(AsafeDocumentCommentTable)
      .values({
        documentId: input.documentId,
        authorId: input.authorId,
        parentId: input.parentId ?? null,
        content: input.content,
      })
      .returning();
    const [author] = await db
      .select({ name: UserTable.name, image: UserTable.image })
      .from(UserTable)
      .where(eq(UserTable.id, input.authorId))
      .limit(1);
    return {
      id: row.id,
      documentId: row.documentId,
      parentId: row.parentId,
      authorId: row.authorId,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      authorName: author?.name ?? "",
      authorImage: author?.image ?? undefined,
      isOwner: true,
    };
  },

  /**
   * Threaded tree (one level of replies) for a doc, oldest first. `userId`
   * stamps isOwner so the panel can show a delete affordance only on the
   * viewer's own comments. Returns top-level comments with `replies` grafted.
   */
  async listByDocument(
    documentId: string,
    userId?: string,
  ): Promise<DocumentCommentWithUser[]> {
    const rows = await db
      .select({
        id: AsafeDocumentCommentTable.id,
        documentId: AsafeDocumentCommentTable.documentId,
        parentId: AsafeDocumentCommentTable.parentId,
        authorId: AsafeDocumentCommentTable.authorId,
        content: AsafeDocumentCommentTable.content,
        createdAt: AsafeDocumentCommentTable.createdAt,
        updatedAt: AsafeDocumentCommentTable.updatedAt,
        authorName: UserTable.name,
        authorImage: UserTable.image,
      })
      .from(AsafeDocumentCommentTable)
      .leftJoin(UserTable, eq(AsafeDocumentCommentTable.authorId, UserTable.id))
      .where(eq(AsafeDocumentCommentTable.documentId, documentId))
      .orderBy(asc(AsafeDocumentCommentTable.createdAt));

    const nodes: DocumentCommentWithUser[] = rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      parentId: r.parentId,
      authorId: r.authorId,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      authorName: r.authorName ?? "",
      authorImage: r.authorImage ?? undefined,
      isOwner: userId ? r.authorId === userId : undefined,
    }));

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const node of nodes) {
      if (node.parentId) {
        const parent = byId.get(node.parentId);
        if (parent) parent.replies = [...(parent.replies ?? []), node];
      }
    }
    return nodes.filter((n) => !n.parentId);
  },

  /** Owner of a comment + its documentId, for the delete ACL decision. */
  async getCommentOwner(
    id: string,
  ): Promise<{ authorId: string; documentId: string } | null> {
    const [row] = await db
      .select({
        authorId: AsafeDocumentCommentTable.authorId,
        documentId: AsafeDocumentCommentTable.documentId,
      })
      .from(AsafeDocumentCommentTable)
      .where(eq(AsafeDocumentCommentTable.id, id))
      .limit(1);
    return row ?? null;
  },

  /**
   * Delete a comment. When `allowAnyAuthor` is false (the default) the delete
   * only matches the author's own comment — a non-author can never remove
   * someone else's. The calling action sets `allowAnyAuthor` only after it has
   * verified the caller is an org admin.
   */
  async deleteComment(
    id: string,
    authorId: string,
    allowAnyAuthor = false,
  ): Promise<void> {
    await db
      .delete(AsafeDocumentCommentTable)
      .where(
        allowAnyAuthor
          ? eq(AsafeDocumentCommentTable.id, id)
          : and(
              eq(AsafeDocumentCommentTable.id, id),
              eq(AsafeDocumentCommentTable.authorId, authorId),
            ),
      );
  },
};

export type { DocumentCommentWithUser as DocumentComment };
