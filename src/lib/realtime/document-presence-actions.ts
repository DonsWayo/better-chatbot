"use server";

import { getSession } from "auth/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafePresenceTable } from "lib/db/pg/schema.pg";
import { PRESENCE_ACTIVE_WINDOW_MS } from "lib/realtime/shapes";

/**
 * Lightweight "who's viewing" presence for PUBLIC chat-export documents
 * (/export/[id]). This is the POLLING sibling of the Electric presence island
 * (src/lib/realtime/presence-actions.ts): the export page is public, so the
 * authenticated Electric shape proxy can't serve anonymous viewers and we
 * poll a plain count instead.
 *
 * Privacy / safety:
 *  - Only logged-in viewers send a heartbeat; anonymous viewers are simply not
 *    counted (no auth changes, no tracking of signed-out users).
 *  - The count endpoint exposes a NUMBER only — never identities — so a public
 *    page never leaks who is reading it.
 *
 * Reuses the asafe_presence table with context_type='document'. context_id is
 * the chat-export id (a nanoid, stored in the `text` context_id column).
 */

/** Documents have nanoid ids, not uuids — accept a bounded printable token. */
const DOCUMENT_ID_RE = /^[A-Za-z0-9_-]{1,255}$/;

export async function heartbeatDocumentPresenceAction(
  exportId: string,
): Promise<void> {
  const session = await getSession();
  const userId = session?.user?.id;
  // Anonymous viewers don't heartbeat — they're just not counted. No error.
  if (!userId) return;
  if (!DOCUMENT_ID_RE.test(exportId)) {
    throw new Error("Invalid document id");
  }

  await db
    .insert(AsafePresenceTable)
    .values({
      userId,
      contextType: "document",
      contextId: exportId,
      lastSeenAt: new Date(),
      typing: false,
    })
    .onConflictDoUpdate({
      target: [
        AsafePresenceTable.userId,
        AsafePresenceTable.contextType,
        AsafePresenceTable.contextId,
      ],
      set: { lastSeenAt: new Date() },
    });
}

/**
 * Count distinct logged-in viewers active on a document within the standard
 * presence window. Callable by anyone (the page is public) — returns a number
 * only. Anonymous viewers are not represented in the table, so they are not
 * counted; the figure is "N signed-in people viewing".
 */
export async function countDocumentViewers(exportId: string): Promise<number> {
  if (!DOCUMENT_ID_RE.test(exportId)) return 0;
  const cutoff = new Date(Date.now() - PRESENCE_ACTIVE_WINDOW_MS);
  const rows = await db
    .select({
      count: sql<number>`count(distinct ${AsafePresenceTable.userId})`,
    })
    .from(AsafePresenceTable)
    .where(
      and(
        eq(AsafePresenceTable.contextType, "document"),
        eq(AsafePresenceTable.contextId, exportId),
        gte(AsafePresenceTable.lastSeenAt, cutoff),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}
