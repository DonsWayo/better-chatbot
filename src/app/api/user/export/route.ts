import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  AsafeMessageFeedbackTable,
  AsafePromptTemplateTable,
  AsafeUsageEventTable,
  ChatMessageTable,
  ChatThreadTable,
  UserMemoryTable,
} from "@/lib/db/pg/schema.pg";
import { eq, inArray } from "drizzle-orm";
import { getSession } from "lib/auth/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/export
 *
 * GDPR Art. 20 — Right to data portability.
 * Returns a JSON file with all personal data for the authenticated user.
 */
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  // Fetch all user data in parallel
  const [threads, usageEvents, feedback, promptTemplates, memoryRows] =
    await Promise.all([
      db
        .select()
        .from(ChatThreadTable)
        .where(eq(ChatThreadTable.userId, userId)),
      db
        .select()
        .from(AsafeUsageEventTable)
        .where(eq(AsafeUsageEventTable.userId, userId)),
      db
        .select()
        .from(AsafeMessageFeedbackTable)
        .where(eq(AsafeMessageFeedbackTable.userId, userId)),
      db
        .select()
        .from(AsafePromptTemplateTable)
        .where(eq(AsafePromptTemplateTable.authorId, userId)),
      db
        .select()
        .from(UserMemoryTable)
        .where(eq(UserMemoryTable.userId, userId)),
    ]);

  // Fetch messages for all threads
  const threadIds = threads.map((t) => t.id);
  const messages =
    threadIds.length > 0
      ? await db
          .select()
          .from(ChatMessageTable)
          .where(inArray(ChatMessageTable.threadId, threadIds))
      : [];

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    },
    conversations: threads.map((thread) => ({
      ...thread,
      messages: messages.filter((m) => m.threadId === thread.id),
    })),
    usageEvents,
    feedback,
    promptTemplates,
    // User memory (docs/design/user-memory.md): memories are decoupled from
    // chats, so the export lists them directly (embeddings stripped — they
    // are derived data, not personal data the user can read).
    memories: memoryRows.map(({ embedding: _embedding, ...rest }) => rest),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="asafe-ai-data-export-${userId.slice(0, 8)}.json"`,
    },
  });
}
