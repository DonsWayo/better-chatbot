"use server";

import { requireAdminPermission } from "auth/permissions";
import { getSession } from "auth/server";
import { writeAuditLog } from "lib/compliance/audit";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "lib/db/pg/repositories/api-key-repository.pg";
import { revalidatePath } from "next/cache";

// Admin issuance surface for the public /api/v1 keys. All actions are
// admin-gated. createApiKeyAction returns the ONE-TIME plaintext secret — it is
// shown exactly once in the UI and never persisted in retrievable form.

export interface ApiKeyListItem {
  id: string;
  name: string;
  keyPrefix: string;
  teamId: string | null;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listApiKeysAction(): Promise<ApiKeyListItem[]> {
  await requireAdminPermission("manage API keys");
  const rows = await listApiKeys(null);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.keyPrefix,
    teamId: r.teamId,
    scopes: r.scopes,
    lastUsedAt: r.lastUsedAt,
    expiresAt: r.expiresAt,
    revokedAt: r.revokedAt,
    createdAt: r.createdAt,
  }));
}

export interface CreateApiKeyActionResult {
  id: string;
  name: string;
  keyPrefix: string;
  /** The ONE-TIME plaintext secret — surfaced once, never retrievable again. */
  plaintext: string;
}

export async function createApiKeyAction(input: {
  name: string;
  teamId?: string | null;
}): Promise<CreateApiKeyActionResult> {
  await requireAdminPermission("create API keys");
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: session required to create API keys");
  }

  const name = input.name?.trim();
  if (!name) throw new Error("A key name is required");

  const { record, plaintext } = await createApiKey({
    name,
    createdBy: userId,
    teamId: input.teamId || null,
  });

  void writeAuditLog({
    userId,
    teamId: input.teamId || null,
    eventType: "admin_action",
    details: {
      action: "api_key_created",
      apiKeyId: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
    },
  });

  revalidatePath("/admin/api-keys");
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    plaintext,
  };
}

export async function revokeApiKeyAction(id: string): Promise<void> {
  await requireAdminPermission("revoke API keys");
  const session = await getSession();
  const userId = session?.user?.id;
  await revokeApiKey(id);
  if (userId) {
    void writeAuditLog({
      userId,
      eventType: "admin_action",
      details: { action: "api_key_revoked", apiKeyId: id },
    });
  }
  revalidatePath("/admin/api-keys");
}
