import { eq } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AsafeStorageObjectTable,
  type AsafeStorageObjectEntity,
} from "../schema.pg";

export interface RecordStorageObjectInput {
  storageKey: string;
  uploaderUserId: string;
  teamId?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface StorageObjectRepository {
  /**
   * Persist (or refresh) the owner record for an uploaded storage key.
   * Idempotent on storageKey: a repeated upload completion for the same key
   * updates the metadata but never reassigns the uploader.
   */
  recordStorageObject(input: RecordStorageObjectInput): Promise<void>;

  getStorageObjectByKey(
    storageKey: string,
  ): Promise<AsafeStorageObjectEntity | null>;

  /**
   * True iff the given user owns the storage key. Owner-only today; this is the
   * single choke point to later extend with grants / team sharing.
   */
  canAccessStorageKey(storageKey: string, userId: string): Promise<boolean>;
}

export const pgStorageObjectRepository: StorageObjectRepository = {
  async recordStorageObject({
    storageKey,
    uploaderUserId,
    teamId = null,
    contentType = null,
    sizeBytes = null,
  }) {
    await db
      .insert(AsafeStorageObjectTable)
      .values({
        storageKey,
        uploaderUserId,
        teamId: teamId ?? null,
        contentType: contentType ?? null,
        sizeBytes: sizeBytes ?? null,
      })
      .onConflictDoUpdate({
        target: AsafeStorageObjectTable.storageKey,
        // Refresh metadata only — never reassign the uploader.
        set: {
          contentType: contentType ?? null,
          sizeBytes: sizeBytes ?? null,
          teamId: teamId ?? null,
        },
      });
  },

  async getStorageObjectByKey(storageKey) {
    const [row] = await db
      .select()
      .from(AsafeStorageObjectTable)
      .where(eq(AsafeStorageObjectTable.storageKey, storageKey))
      .limit(1);
    return row ?? null;
  },

  async canAccessStorageKey(storageKey, userId) {
    const row = await this.getStorageObjectByKey(storageKey);
    if (!row) return false;
    return row.uploaderUserId === userId;
  },
};
