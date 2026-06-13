import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { type AsafeApiKeyEntity, AsafeApiKeyTable } from "../schema.pg";

// Public programmatic API keys (migration 0046). The plaintext secret is a
// `ck_live_<random>` string returned ONCE at creation; only its sha256 hash is
// stored. Lookups hash the presented Bearer token and compare against the
// unique key_hash column, rejecting revoked/expired keys and stamping
// last_used_at on a successful match.

const KEY_PREFIX = "ck_live_";
/** First N chars of the plaintext kept for display (e.g. "ck_live_AbC"). */
const DISPLAY_PREFIX_LEN = 11;

/** Full-access scope sentinel. A key with "*" passes every scope check. */
export const FULL_SCOPE = "*" as const;

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Generate a fresh `ck_live_<48 hex>` secret. */
function generatePlaintextKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export interface CreateApiKeyInput {
  name: string;
  createdBy: string;
  teamId?: string | null;
  scopes?: string[];
  /** Optional absolute expiry; null/undefined = never expires. */
  expiresAt?: Date | null;
}

export interface CreateApiKeyResult {
  record: AsafeApiKeyEntity;
  /** The ONE-TIME plaintext secret. Never persisted, never retrievable again. */
  plaintext: string;
}

/**
 * Mint a new API key. Returns the stored row plus the one-time plaintext
 * secret — the caller MUST surface the plaintext to the issuing admin
 * immediately; it can never be recovered afterwards.
 */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const plaintext = generatePlaintextKey();
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = plaintext.slice(0, DISPLAY_PREFIX_LEN);
  const [record] = await db
    .insert(AsafeApiKeyTable)
    .values({
      keyHash,
      keyPrefix,
      name: input.name,
      createdBy: input.createdBy,
      teamId: input.teamId ?? null,
      scopes: input.scopes?.length ? input.scopes : [FULL_SCOPE],
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return { record, plaintext };
}

/**
 * List keys. With a teamId, only keys scoped to that team; without one (admin
 * "all" view) every key. Revoked keys are included so the admin UI can show
 * their status; ordered newest first.
 */
export async function listApiKeys(
  teamId?: string | null,
): Promise<AsafeApiKeyEntity[]> {
  const base = db.select().from(AsafeApiKeyTable);
  const rows = teamId
    ? await base
        .where(eq(AsafeApiKeyTable.teamId, teamId))
        .orderBy(desc(AsafeApiKeyTable.createdAt))
    : await base.orderBy(desc(AsafeApiKeyTable.createdAt));
  return rows;
}

/** Fetch a single key row by id (any status), or null. */
export async function getApiKeyById(
  id: string,
): Promise<AsafeApiKeyEntity | null> {
  const [row] = await db
    .select()
    .from(AsafeApiKeyTable)
    .where(eq(AsafeApiKeyTable.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Revoke a key (idempotent). Stamps revoked_at; an already-revoked key keeps
 * its original timestamp. Returns the updated row, or null if no such id.
 */
export async function revokeApiKey(
  id: string,
): Promise<AsafeApiKeyEntity | null> {
  const [row] = await db
    .update(AsafeApiKeyTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(AsafeApiKeyTable.id, id), isNull(AsafeApiKeyTable.revokedAt)))
    .returning();
  if (row) return row;
  // Already revoked (or missing) — return the current row unchanged so callers
  // treating revoke as idempotent still see the row.
  return getApiKeyById(id);
}

/**
 * Hash + look up a presented plaintext key. Returns null when the key is
 * unknown, revoked, or expired. On a valid match, last_used_at is stamped
 * (best-effort — a stamp failure must not deny an otherwise-valid key).
 */
export async function findByPlaintext(
  plaintext: string,
): Promise<AsafeApiKeyEntity | null> {
  if (!plaintext.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashApiKey(plaintext);
  const [row] = await db
    .select()
    .from(AsafeApiKeyTable)
    .where(eq(AsafeApiKeyTable.keyHash, keyHash))
    .limit(1);
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  try {
    await db
      .update(AsafeApiKeyTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(AsafeApiKeyTable.id, row.id));
  } catch {
    // Non-fatal: serve the valid key even if the usage stamp fails.
  }
  return row;
}
