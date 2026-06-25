import { and, desc, eq, inArray } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AsafeDocumentTable,
  AsafeMentionNotificationTable,
  UserTable,
} from "../schema.pg";

export interface MentionNotificationWithContext {
  id: string;
  recipientId: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  documentId: string;
  documentTitle: string;
  commentId: string;
  isRead: boolean;
  createdAt: Date;
}

export const pgMentionNotificationRepository = {
  async insertMentions(
    mentions: {
      recipientId: string;
      authorId: string;
      documentId: string;
      commentId: string;
    }[],
  ): Promise<void> {
    if (mentions.length === 0) return;
    await db.insert(AsafeMentionNotificationTable).values(mentions);
  },

  async getUnreadForUser(
    userId: string,
    limit = 50,
  ): Promise<MentionNotificationWithContext[]> {
    const author = db
      .select({ id: UserTable.id, name: UserTable.name, image: UserTable.image })
      .from(UserTable)
      .as("author");

    const rows = await db
      .select({
        id: AsafeMentionNotificationTable.id,
        recipientId: AsafeMentionNotificationTable.recipientId,
        authorId: AsafeMentionNotificationTable.authorId,
        authorName: author.name,
        authorImage: author.image,
        documentId: AsafeMentionNotificationTable.documentId,
        documentTitle: AsafeDocumentTable.title,
        commentId: AsafeMentionNotificationTable.commentId,
        isRead: AsafeMentionNotificationTable.isRead,
        createdAt: AsafeMentionNotificationTable.createdAt,
      })
      .from(AsafeMentionNotificationTable)
      .leftJoin(
        author,
        eq(AsafeMentionNotificationTable.authorId, author.id),
      )
      .leftJoin(
        AsafeDocumentTable,
        eq(AsafeMentionNotificationTable.documentId, AsafeDocumentTable.id),
      )
      .where(
        and(
          eq(AsafeMentionNotificationTable.recipientId, userId),
          eq(AsafeMentionNotificationTable.isRead, false),
        ),
      )
      .orderBy(desc(AsafeMentionNotificationTable.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      recipientId: r.recipientId,
      authorId: r.authorId,
      authorName: r.authorName ?? "",
      authorImage: r.authorImage ?? undefined,
      documentId: r.documentId,
      documentTitle: r.documentTitle ?? "Untitled",
      commentId: r.commentId,
      isRead: r.isRead,
      createdAt: r.createdAt,
    }));
  },

  async markRead(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(AsafeMentionNotificationTable)
      .set({ isRead: true })
      .where(
        and(
          eq(AsafeMentionNotificationTable.recipientId, userId),
          inArray(AsafeMentionNotificationTable.id, ids),
        ),
      );
  },

  async markReadForDocument(userId: string, documentId: string): Promise<void> {
    await db
      .update(AsafeMentionNotificationTable)
      .set({ isRead: true })
      .where(
        and(
          eq(AsafeMentionNotificationTable.recipientId, userId),
          eq(AsafeMentionNotificationTable.documentId, documentId),
        ),
      );
  },
};
