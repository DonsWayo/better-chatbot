import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import {
  UserTable,
  ChatThreadTable,
  AsafeUsageEventTable,
  AsafeAuditLogTable,
  AsafeAupAcceptanceTable,
  AsafeTeamMemberTable,
  AsafeUserModelGrantTable,
} from "@/lib/db/pg/schema.pg";
import { eq, sql } from "drizzle-orm";

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
}

/** Build a full GDPR data export for a given user. */
export async function exportUserData(userId: string): Promise<GdprExportData> {
  const [profile, chatThreads, usageEvents, auditEntries, aupAcceptances, teamMemberships, modelGrants] =
    await Promise.all([
      db.select().from(UserTable).where(eq(UserTable.id, userId)).limit(1),
      db.select().from(ChatThreadTable).where(eq(ChatThreadTable.userId, userId)),
      db.select().from(AsafeUsageEventTable).where(eq(AsafeUsageEventTable.userId, userId)),
      db.select().from(AsafeAuditLogTable).where(eq(AsafeAuditLogTable.userId, userId)),
      db.select().from(AsafeAupAcceptanceTable).where(eq(AsafeAupAcceptanceTable.userId, userId)),
      db.select().from(AsafeTeamMemberTable).where(eq(AsafeTeamMemberTable.userId, userId)),
      db.select().from(AsafeUserModelGrantTable).where(eq(AsafeUserModelGrantTable.userId, userId)),
    ]);

  // Scrub the password hash from the export — it serves no subject-access purpose
  const safeProfile = profile[0] ? { ...profile[0], password: undefined } : null;

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
  };
}

/**
 * GDPR erasure: anonymise the user record and delete personal-data rows.
 * We anonymise (not hard-delete) the user row so FK constraints remain intact
 * and usage/audit records retain their shape for audit purposes — the personal
 * identifier is removed.
 */
export async function eraseUserData(userId: string): Promise<{ tablesCleared: string[] }> {
  const cleared: string[] = [];

  // 1. Anonymise the user profile (replace name + email with a tombstone)
  await db
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
  await db.delete(ChatThreadTable).where(eq(ChatThreadTable.userId, userId));
  cleared.push("chat_thread");

  // 3. Delete usage events
  await db.delete(AsafeUsageEventTable).where(eq(AsafeUsageEventTable.userId, userId));
  cleared.push("asafe_usage_event");

  // 4. Delete model grants
  await db.delete(AsafeUserModelGrantTable).where(eq(AsafeUserModelGrantTable.userId, userId));
  cleared.push("asafe_user_model_grant");

  // 5. Delete AUP acceptances
  await db.delete(AsafeAupAcceptanceTable).where(eq(AsafeAupAcceptanceTable.userId, userId));
  cleared.push("asafe_aup_acceptance");

  // 6. Remove team memberships
  await db.delete(AsafeTeamMemberTable).where(eq(AsafeTeamMemberTable.userId, userId));
  cleared.push("asafe_team_member");

  // 7. Append erasure audit record (anonymised — no personal data)
  await db.execute(
    sql`INSERT INTO asafe_audit_log (event_type, user_id, detail)
        VALUES ('user_erasure', ${userId}, '{"gdpr_erasure":true}')`,
  );
  cleared.push("asafe_audit_log (erasure record)");

  return { tablesCleared: cleared };
}
