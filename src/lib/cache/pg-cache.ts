import "server-only";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafeKvCacheTable } from "@/lib/db/pg/schema.pg";
import { eq, isNull, or, gt, and, like } from "drizzle-orm";
import { Cache } from "./cache.interface";

export class PgCache implements Cache {
  constructor(private readonly prefix: string = "") {}

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const rows = await db
      .select()
      .from(AsafeKvCacheTable)
      .where(
        and(
          eq(AsafeKvCacheTable.key, this.k(key)),
          or(
            isNull(AsafeKvCacheTable.expiresAt),
            gt(AsafeKvCacheTable.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);

    if (rows.length === 0) return undefined;
    return rows[0].value as T;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const expiresAt =
      ttlMs != null ? new Date(Date.now() + ttlMs) : null;

    await db
      .insert(AsafeKvCacheTable)
      .values({ key: this.k(key), value: value as any, expiresAt })
      .onConflictDoUpdate({
        target: AsafeKvCacheTable.key,
        set: { value: value as any, expiresAt },
      });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async delete(key: string): Promise<void> {
    await db
      .delete(AsafeKvCacheTable)
      .where(eq(AsafeKvCacheTable.key, this.k(key)));
  }

  async clear(): Promise<void> {
    if (this.prefix) {
      await db
        .delete(AsafeKvCacheTable)
        .where(like(AsafeKvCacheTable.key, `${this.prefix}%`));
    } else {
      await db.delete(AsafeKvCacheTable);
    }
  }

  async getAll(): Promise<Map<string, unknown>> {
    const rows = await db
      .select()
      .from(AsafeKvCacheTable)
      .where(
        or(
          isNull(AsafeKvCacheTable.expiresAt),
          gt(AsafeKvCacheTable.expiresAt, new Date()),
        ),
      );

    const result = new Map<string, unknown>();
    const prefixLen = this.prefix.length;
    for (const row of rows) {
      if (!this.prefix || row.key.startsWith(this.prefix)) {
        const logicalKey = prefixLen > 0 ? row.key.slice(prefixLen) : row.key;
        result.set(logicalKey, row.value);
      }
    }
    return result;
  }
}
