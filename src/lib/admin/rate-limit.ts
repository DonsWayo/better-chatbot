import "server-only";

import { pgDb } from "lib/db/pg/db.pg";
import { AsafeRateLimitBucketTable } from "lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";

export async function resetUserRateLimit(userId: string): Promise<number> {
  const deleted = await pgDb
    .delete(AsafeRateLimitBucketTable)
    .where(eq(AsafeRateLimitBucketTable.userId, userId))
    .returning();
  return deleted.length;
}
