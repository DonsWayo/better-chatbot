/**
 * POST /api/cron/rate-limit-purge
 *
 * Housekeeping to bound table growth (perf audit P2). Two tables accumulate
 * short-lived rows that are never read once stale:
 *   • asafe_rate_limit_bucket — one row per (user, 1-minute window). A row is
 *     dead the moment its window rolls over; we keep ~1h of slack then delete.
 *   • asafe_kv_cache — Postgres-backed KV cache; rows with expires_at < now are
 *     expired and will never be served again.
 *
 * Called by the scheduler (Kubernetes CronJob / ECS Scheduled Task) — no
 * scheduler wiring lives here, just the endpoint. Protected by the same
 * CRON_SECRET Bearer token as cron/budget-reset + cron/audit-purge.
 */

import {
  AsafeKvCacheTable,
  AsafeRateLimitBucketTable,
} from "@/lib/db/pg/schema.pg";
import { lt } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import globalLogger from "logger";
import { NextRequest, NextResponse } from "next/server";

const logger = globalLogger.withDefaults({
  message: "cron/rate-limit-purge: ",
});

// Keep an hour of slack so an in-flight window is never deleted mid-use.
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const rateLimitCutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);

  // Delete rate-limit buckets whose window started more than ~1h ago.
  const rateLimitDeleted = await db
    .delete(AsafeRateLimitBucketTable)
    .where(lt(AsafeRateLimitBucketTable.windowStart, rateLimitCutoff))
    .returning({ userId: AsafeRateLimitBucketTable.userId });

  // Delete KV-cache rows that have already expired (expires_at < now). Rows
  // with a NULL expires_at never expire and are left untouched (lt excludes
  // them).
  const kvCacheDeleted = await db
    .delete(AsafeKvCacheTable)
    .where(lt(AsafeKvCacheTable.expiresAt, now))
    .returning({ key: AsafeKvCacheTable.key });

  logger.info(
    `purged ${rateLimitDeleted.length} rate-limit buckets older than ${rateLimitCutoff.toISOString()} and ${kvCacheDeleted.length} expired kv-cache rows`,
  );

  return NextResponse.json({
    rateLimitDeleted: rateLimitDeleted.length,
    kvCacheDeleted: kvCacheDeleted.length,
    cutoff: rateLimitCutoff.toISOString(),
  });
}
