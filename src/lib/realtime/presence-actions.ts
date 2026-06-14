"use server";

import { getSession } from "auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafePresenceTable } from "lib/db/pg/schema.pg";
import { documentRepository } from "lib/db/repository";
import {
  type PresenceContextType,
  isPresenceContextType,
  isUuid,
} from "lib/realtime/shapes";
import { canAccessFolder, canReadThread } from "lib/teamspaces/folders";

/**
 * Presence heartbeat (Electric realtime phase 3 — see
 * content/docs/collaboration/realtime.mdx#presence).
 *
 * The ONLY write path for asafe_presence: clients call this every 30s while a
 * shared thread/folder is open and the tab is visible. Reads stream back to
 * everyone in the context via the `asafe_presence` shape through the
 * authenticated proxy. One cheap upsert per call — the unique
 * (user_id, context_type, context_id) constraint makes it idempotent.
 *
 * `typing` piggybacks on the same row: the composer's typing beacon
 * (src/components/realtime/use-typing-beacon.ts) sends typing=true beats while
 * the user types and one typing=false beat when they stop. All other callers
 * omit the param, so every regular 30s heartbeat doubles as a typing clear —
 * a stuck typing=true can never outlive the next plain beat.
 */
export async function heartbeatPresenceAction(
  contextType: PresenceContextType,
  contextId: string,
  typing = false,
): Promise<void> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  if (!isPresenceContextType(contextType)) {
    throw new Error("Invalid presence context type");
  }
  if (!isUuid(contextId)) {
    throw new Error("Invalid presence context id");
  }

  // Same gates as the presence shape itself: you can only announce yourself
  // in a context you are allowed to read.
  const allowed =
    contextType === "thread"
      ? await canReadThread(contextId, userId)
      : contextType === "folder"
        ? await canAccessFolder(contextId, userId)
        : // document: read access on the doc (unified visibility).
          await documentRepository.checkAccess(contextId, userId, true);
  if (!allowed) {
    throw new Error("Forbidden");
  }

  await db
    .insert(AsafePresenceTable)
    .values({ userId, contextType, contextId, lastSeenAt: new Date(), typing })
    .onConflictDoUpdate({
      target: [
        AsafePresenceTable.userId,
        AsafePresenceTable.contextType,
        AsafePresenceTable.contextId,
      ],
      set: { lastSeenAt: new Date(), typing },
    });
}
