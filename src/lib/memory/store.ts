import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserMemoryTable } from "lib/db/pg/schema.pg";
import type { UserMemoryEntity } from "lib/db/pg/schema.pg";

// ---------------------------------------------------------------------------
// User memory store (docs/design/user-memory.md) — thin Drizzle CRUD over
// `user_memory`. "Active" = not superseded; supersede chains replace silent
// overwrites so conflict history stays auditable. Hard deletes only (GDPR
// erasure path); user deletion cascades via the FK.
// ---------------------------------------------------------------------------

export type MemoryKind = UserMemoryEntity["kind"];

export interface InsertMemoryInput {
  userId: string;
  kind: MemoryKind;
  content: string;
  /** null = global scope; `agent:<id>` / `folder:<id>` namespaces later. */
  scopeId?: string | null;
  /** Embedded best-effort — null when the embedder was unavailable. */
  embedding?: number[] | null;
  /** Provenance only (no FK — thread deletion must NOT cascade). */
  sourceThreadId?: string | null;
  /** 1.0 for explicit "remember this"; extractor estimate otherwise. */
  confidence?: number;
}

/**
 * Active (non-superseded) memories for a user, newest first.
 * When `scopeId` is given, only that scope is returned; otherwise all scopes.
 */
export async function listActiveMemories(
  userId: string,
  scopeId?: string | null,
): Promise<UserMemoryEntity[]> {
  const conditions = [
    eq(UserMemoryTable.userId, userId),
    isNull(UserMemoryTable.supersededBy),
  ];
  if (scopeId !== undefined) {
    conditions.push(
      scopeId === null
        ? isNull(UserMemoryTable.scopeId)
        : eq(UserMemoryTable.scopeId, scopeId),
    );
  }
  return db
    .select()
    .from(UserMemoryTable)
    .where(and(...conditions))
    .orderBy(desc(UserMemoryTable.createdAt));
}

export async function insertMemory(
  input: InsertMemoryInput,
): Promise<UserMemoryEntity> {
  const [row] = await db
    .insert(UserMemoryTable)
    .values({
      userId: input.userId,
      kind: input.kind,
      content: input.content,
      scopeId: input.scopeId ?? null,
      embedding: input.embedding ?? null,
      sourceThreadId: input.sourceThreadId ?? null,
      confidence: input.confidence ?? 0.5,
    })
    .returning();
  return row;
}

/**
 * Mark `oldId` as superseded by `newId`. Scoped to the owner and to rows not
 * already superseded, so chains stay linear.
 */
export async function supersedeMemory(
  oldId: string,
  newId: string,
  userId: string,
): Promise<void> {
  await db
    .update(UserMemoryTable)
    .set({ supersededBy: newId })
    .where(
      and(
        eq(UserMemoryTable.id, oldId),
        eq(UserMemoryTable.userId, userId),
        isNull(UserMemoryTable.supersededBy),
      ),
    );
}

/** Per-item erasure. Owner-scoped — a user can only delete their own rows. */
export async function deleteMemory(id: string, userId: string): Promise<void> {
  await db
    .delete(UserMemoryTable)
    .where(and(eq(UserMemoryTable.id, id), eq(UserMemoryTable.userId, userId)));
}

/** Clear-all / reset / GDPR erasure: hard-delete every row for the user. */
export async function deleteAllMemories(userId: string): Promise<void> {
  await db.delete(UserMemoryTable).where(eq(UserMemoryTable.userId, userId));
}

/** Usage-ranking signal: bump `last_used_at` for the injected rows. */
export async function bumpLastUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(UserMemoryTable)
    .set({ lastUsedAt: new Date() })
    .where(inArray(UserMemoryTable.id, ids));
}
