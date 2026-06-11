import "server-only";

import { AsafeAuditLogTable, UserTable } from "@/lib/db/pg/schema.pg";
import { type SQL, and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";

export type AuditActorType = "human" | "agent";

export interface AuditLogRow {
  id: string;
  userId: string;
  userEmail: string | null;
  teamId: string | null;
  actorType: AuditActorType;
  agentSessionId: string | null;
  eventType: string;
  details: unknown;
  createdAt: Date;
}

export interface GetAuditLogOptions {
  page?: number;
  limit?: number;
  /** Absolute row offset — overrides page-based pagination when provided. */
  offset?: number;
  eventType?: string;
  userId?: string;
  teamId?: string;
  actorType?: AuditActorType;
  agentSessionId?: string;
  from?: Date;
  to?: Date;
}

export async function getAuditLog(
  options: GetAuditLogOptions = {},
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const {
    page = 1,
    limit = 50,
    eventType,
    userId,
    teamId,
    actorType,
    agentSessionId,
    from,
    to,
  } = options;
  const offset = options.offset ?? (page - 1) * limit;

  const conditions: SQL[] = [];
  if (eventType) conditions.push(eq(AsafeAuditLogTable.eventType, eventType));
  if (userId) conditions.push(ilike(AsafeAuditLogTable.userId, `%${userId}%`));
  if (teamId) conditions.push(eq(AsafeAuditLogTable.teamId, teamId));
  if (actorType) conditions.push(eq(AsafeAuditLogTable.actorType, actorType));
  if (agentSessionId)
    conditions.push(eq(AsafeAuditLogTable.agentSessionId, agentSessionId));
  if (from) conditions.push(gte(AsafeAuditLogTable.createdAt, from));
  if (to) conditions.push(lte(AsafeAuditLogTable.createdAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: AsafeAuditLogTable.id,
        userId: AsafeAuditLogTable.userId,
        userEmail: UserTable.email,
        teamId: AsafeAuditLogTable.teamId,
        actorType: AsafeAuditLogTable.actorType,
        agentSessionId: AsafeAuditLogTable.agentSessionId,
        eventType: AsafeAuditLogTable.eventType,
        details: AsafeAuditLogTable.details,
        createdAt: AsafeAuditLogTable.createdAt,
      })
      .from(AsafeAuditLogTable)
      // audit user_id is text (may hold non-uuid actor ids); user.id is uuid —
      // cast the uuid side so Postgres doesn't reject the join (uuid = text).
      .leftJoin(
        UserTable,
        sql`${UserTable.id}::text = ${AsafeAuditLogTable.userId}`,
      )
      .where(where)
      .orderBy(desc(AsafeAuditLogTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(AsafeAuditLogTable)
      .where(where),
  ]);

  return { rows, total: countRow?.total ?? 0 };
}

// ── Compliance API constants (B90 #23) ──────────────────────────────────────
// Kept here (not in the route files) because Next.js route modules may only
// export HTTP handlers — and so tests can import them.

/** Default page size for GET /api/admin/compliance/audit. */
export const COMPLIANCE_AUDIT_DEFAULT_LIMIT = 100;
/** Hard page-size cap for GET /api/admin/compliance/audit. */
export const COMPLIANCE_AUDIT_MAX_LIMIT = 1000;
/** Row cap for GET /api/admin/compliance/export CSV downloads. */
export const COMPLIANCE_EXPORT_MAX_ROWS = 50_000;
/** Batch size used when paging audit rows into the CSV export stream. */
export const COMPLIANCE_EXPORT_PAGE_SIZE = 1_000;

export const AUDIT_EVENT_TYPES = [
  "chat_request",
  "rag_retrieval",
  "tool_call",
  "guardrail_firing",
  "admin_action",
  "user_erasure",
  "aup_accepted",
] as const;
