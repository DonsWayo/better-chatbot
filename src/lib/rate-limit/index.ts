/**
 * In-memory per-user rate limiter. Works for single-pod dev/test.
 * Wave 12 TODO: replace Map with Redis (Upstash) for multi-pod production.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const GC_INTERVAL_MS = 5 * 60_000; // prune stale entries every 5 min

// Periodically clean up expired buckets to prevent memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, GC_INTERVAL_MS).unref?.();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

export function checkRateLimit(
  userId: string,
  limit = Number(process.env.ASAFE_RATE_LIMIT_RPM ?? 60),
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(userId);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(userId, bucket);
  }

  bucket.count++;
  const remaining = Math.max(0, limit - bucket.count);
  const allowed = bucket.count <= limit;

  return { allowed, remaining, resetAt: bucket.resetAt };
}
