import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafeRateLimitBucketTable } from "@/lib/db/pg/schema.pg";
import { sql } from "drizzle-orm";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // epoch ms
}

export async function checkRateLimit(
  userId: string,
  limit = Number(process.env.ASAFE_RATE_LIMIT_RPM ?? 60),
  windowMs = 60_000,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = windowStart.getTime() + windowMs;

  try {
    // Atomic upsert: increment count, return new value
    const [row] = await db
      .insert(AsafeRateLimitBucketTable)
      .values({ userId, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [AsafeRateLimitBucketTable.userId, AsafeRateLimitBucketTable.windowStart],
        set: { count: sql`${AsafeRateLimitBucketTable.count} + 1` },
      })
      .returning({ count: AsafeRateLimitBucketTable.count });

    const count = row?.count ?? 1;
    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;
    return { allowed, limit, remaining, resetAt };
  } catch (err) {
    // Fail open on DB error — never block inference due to rate limit DB hiccup
    console.error("rate-limit DB error (failing open):", err);
    return { allowed: true, limit, remaining: limit, resetAt };
  }
}
