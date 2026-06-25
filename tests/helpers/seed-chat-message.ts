import { eq } from "drizzle-orm";
import { pgDb } from "../../src/lib/db/pg/db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  UserTable,
} from "../../src/lib/db/pg/schema.pg";

/**
 * Seed a real chat thread + message owned by the given user and return the
 * message id.
 *
 * The `/api/feedback` route (hardened in the deep-audit triage) resolves the
 * posted `messageId` against `chat_message` and requires the caller to own the
 * thread it belongs to — synthetic ids now correctly 404. Feedback e2e specs
 * therefore need a genuine, caller-owned message to exercise the happy path.
 *
 * `chat_message.id` is a TEXT primary key (not a uuid), so a readable test id
 * is valid.
 */
export async function seedChatMessage(userEmail: string): Promise<{
  messageId: string;
  threadId: string;
}> {
  const [user] = await pgDb
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, userEmail));
  if (!user) {
    throw new Error(`seedChatMessage: no user with email ${userEmail}`);
  }

  const [thread] = await pgDb
    .insert(ChatThreadTable)
    .values({ title: "feedback e2e fixture", userId: user.id })
    .returning({ id: ChatThreadTable.id });

  const messageId = `e2e-fb-${thread.id}`;
  await pgDb.insert(ChatMessageTable).values({
    id: messageId,
    threadId: thread.id,
    role: "assistant",
    parts: [{ type: "text", text: "fixture message" }],
  });

  return { messageId, threadId: thread.id };
}
