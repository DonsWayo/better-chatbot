import "server-only";

import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeAuditLogTable, UserTable } from "@/lib/db/pg/schema.pg";
import { eq, desc, gte, lte, and, sql, ilike, type SQL } from "drizzle-orm";

export interface AuditLogRow {
  id: string;
  userId: string;
  userEmail: string | null;
  teamId: string | null;
  eventType: string;
  details: unknown;
  createdAt: Date;
}

export interface GetAuditLogOptions {
  page?: number;
  limit?: number;
  eventType?: string;
  userId?: string;
  teamId?: string;
  from?: Date;
  to?: Date;
}

export async function getAuditLog(
  options: GetAuditLogOptions = {},
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const { page = 1, limit = 50, eventType, userId, teamId, from, to } = options;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (eventType) conditions.push(eq(AsafeAuditLogTable.eventType, eventType));
  if (userId) conditions.push(ilike(AsafeAuditLogTable.userId, `%${userId}%`));
  if (teamId) conditions.push(eq(AsafeAuditLogTable.teamId, teamId));
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
        eventType: AsafeAuditLogTable.eventType,
        details: AsafeAuditLogTable.details,
        createdAt: AsafeAuditLogTable.createdAt,
      })
      .from(AsafeAuditLogTable)
      .leftJoin(UserTable, eq(UserTable.id, AsafeAuditLogTable.userId))
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

export const AUDIT_EVENT_TYPES = [
  "chat_request",
  "rag_retrieval",
  "tool_call",
  "guardrail_firing",
  "admin_action",
  "user_erasure",
  "aup_accepted",
] as const;
