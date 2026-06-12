import "server-only";

import {
  AsafeAuditLogTable,
  AsafeAupAcceptanceTable,
  AsafeTeamMemberTable,
  AsafeUsageEventTable,
  AsafeUserModelGrantTable,
  ChatThreadTable,
  UserMemoryTable,
  UserTable,
} from "@/lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";

export interface GdprExportData {
  exportedAt: string;
  userId: string;
  profile: unknown;
  chatThreads: unknown[];
  usageEvents: unknown[];
  auditEntries: unknown[];
  aupAcceptances: unknown[];
  teamMemberships: unknown[];
  modelGrants: unknown[];
  memories: unknown[];
}

/** Build a full GDPR data export for a given user. */
export async function exportUserData(userId: string): Promise<GdprExportData> {
  const [
    profile,
    chatThreads,
    usageEvents,
    auditEntries,
    aupAcceptances,
    teamMemberships,
    modelGrants,
    memoryRows,
  ] = await Promise.all([
    db.select().from(UserTable).where(eq(UserTable.id, userId)).limit(1),
    db.select().from(ChatThreadTable).where(eq(ChatThreadTable.userId, userId)),
    db
      .select()
      .from(AsafeUsageEventTable)
      .where(eq(AsafeUsageEventTable.userId, userId)),
    db
      .select()
      .from(AsafeAuditLogTable)
      .where(eq(AsafeAuditLogTable.userId, userId)),
    db
      .select()
      .from(AsafeAupAcceptanceTable)
      .where(eq(AsafeAupAcceptanceTable.userId, userId)),
    db
      .select()
      .from(AsafeTeamMemberTable)
      .where(eq(AsafeTeamMemberTable.userId, userId)),
    db
      .select()
      .from(AsafeUserModelGrantTable)
      .where(eq(AsafeUserModelGrantTable.userId, userId)),
    db.select().from(UserMemoryTable).where(eq(UserMemoryTable.userId, userId)),
  ]);

  // Scrub the password hash from the export — it serves no subject-access purpose
  const safeProfile = profile[0]
    ? { ...profile[0], password: undefined }
    : null;

  return {
    exportedAt: new Date().toISOString(),
    userId,
    profile: safeProfile,
    chatThreads,
    usageEvents,
    auditEntries,
    aupAcceptances,
    teamMemberships,
    modelGrants,
    // user_memory rows (embeddings stripped — derived data, not readable PII)
    memories: memoryRows.map(({ embedding: _embedding, ...rest }) => rest),
  };
}

/**
 * GDPR erasure: anonymise the user record and delete personal-data rows.
 * We anonymise (not hard-delete) the user row so FK constraints remain intact
 * and usage/audit records retain their shape for audit purposes — the personal
 * identifier is removed.
 */
export async function eraseUserData(
  userId: string,
): Promise<{ tablesCleared: string[] }> {
  const cleared: string[] = [];

  // Run the whole erasure as a single transaction: if any step (including the
  // audit-record INSERT) fails, the deletions roll back rather than leaving a
  // half-deleted user with no audit trail.
  await db.transaction(async (tx) => {
    // 1. Anonymise the user profile (replace name + email with a tombstone)
    await tx
      .update(UserTable)
      .set({
        name: "[erased]",
        email: `erased-${userId}@deleted.invalid`,
        image: null,
        acceptedAupAt: null,
      })
      .where(eq(UserTable.id, userId));
    cleared.push("user");

    // 2. Delete chat threads + messages (ON DELETE CASCADE handles messages)
    await tx.delete(ChatThreadTable).where(eq(ChatThreadTable.userId, userId));
    cleared.push("chat_thread");

    // 3. Delete usage events
    await tx
      .delete(AsafeUsageEventTable)
      .where(eq(AsafeUsageEventTable.userId, userId));
    cleared.push("asafe_usage_event");

    // 4. Delete model grants
    await tx
      .delete(AsafeUserModelGrantTable)
      .where(eq(AsafeUserModelGrantTable.userId, userId));
    cleared.push("asafe_user_model_grant");

    // 5. Delete AUP acceptances
    await tx
      .delete(AsafeAupAcceptanceTable)
      .where(eq(AsafeAupAcceptanceTable.userId, userId));
    cleared.push("asafe_aup_acceptance");

    // 6. Remove team memberships
    await tx
      .delete(AsafeTeamMemberTable)
      .where(eq(AsafeTeamMemberTable.userId, userId));
    cleared.push("asafe_team_member");

    // 6b. Delete user memories (docs/design/user-memory.md) — the user row is
    // anonymised, not deleted, so the FK cascade never fires here; memories
    // hold personal facts and must be erased explicitly.
    await tx.delete(UserMemoryTable).where(eq(UserMemoryTable.userId, userId));
    cleared.push("user_memory");

    // TODO(gdpr): the walk above leaves PII in other tables. Erase these too
    // once their schema/FK behaviour is confirmed safe to delete inside this
    // transaction:
    //   - session            (active sessions / IP / UA)
    //   - account            (OAuth access/refresh tokens)
    //   - chat_export*        (full conversation content + comments)
    //   - message_feedback.comment
    //   - guardrail_event     (may embed flagged content)
    //   - agent_session.input_payload
    //   - presence, bookmarks/archives/prompts/mcp (user-scoped rows)

    // 7. Append erasure audit record (anonymised — no personal data). The live
    // column is `details` (jsonb, NOT NULL); shape matches lib/compliance/audit
    // (JSON object stored as jsonb). Cast the param so Postgres binds jsonb.
    await tx.execute(
      sql`INSERT INTO asafe_audit_log (event_type, user_id, details)
          VALUES ('user_erasure', ${userId}, ${JSON.stringify({
            gdpr_erasure: true,
          })}::jsonb)`,
    );
    cleared.push("asafe_audit_log (erasure record)");
  });

  return { tablesCleared: cleared };
}
