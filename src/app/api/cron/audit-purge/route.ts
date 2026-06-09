/**
 * POST /api/cron/audit-purge
 *
 * Deletes audit log entries older than AUDIT_RETENTION_DAYS (default 180 days).
 * Called daily by the scheduler. Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeAuditLogTable } from "@/lib/db/pg/schema.pg";
import { lt } from "drizzle-orm";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({ message: "cron/audit-purge: " });
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS ?? "180", 10);

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUDIT_RETENTION_DAYS);

  const deleted = await db
    .delete(AsafeAuditLogTable)
    .where(lt(AsafeAuditLogTable.createdAt, cutoff))
    .returning({ id: AsafeAuditLogTable.id });

  logger.info(`purged ${deleted.length} audit records older than ${cutoff.toISOString()}`);
  return NextResponse.json({ deleted: deleted.length, cutoff: cutoff.toISOString() });
}
