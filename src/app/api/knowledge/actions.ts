"use server";

import { and, eq } from "drizzle-orm";

import {
  AsafeDocumentChunkTable,
  AsafeKnowledgeCollectionTable,
} from "@/lib/db/pg/schema.pg";
import { ingestDocument } from "lib/ai/embeddings/ingest";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  WRITABLE_VISIBILITIES,
  normalizeWriteVisibility,
  resolveTeamIds,
} from "lib/knowledge/collections";
import { canAccess } from "lib/visibility";

/**
 * Server actions for the knowledge Studio UI (mutations only — listing goes
 * through the REST endpoints via SWR). Authorization mirrors the REST routes:
 * create / delete / ingest are admin-only, update requires "manage" on the
 * unified visibility model (owner or org admin).
 */

export type KnowledgeCollectionRow =
  typeof AsafeKnowledgeCollectionTable.$inferSelect;

export interface KnowledgeCollectionWriteInput {
  name: string;
  description?: string | null;
  visibility?: string;
  teamIds?: string[] | null;
}

type SessionUser = { id: string; role?: string | null };

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Admin required");
  }
  return user;
}

function assertValidVisibility(visibility?: string): void {
  if (visibility && !WRITABLE_VISIBILITIES.has(visibility)) {
    throw new Error("Invalid visibility");
  }
}

async function loadCollectionOrThrow(
  id: string,
): Promise<KnowledgeCollectionRow> {
  const [collection] = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, id));
  if (!collection) {
    throw new Error("Collection not found");
  }
  return collection;
}

export async function createKnowledgeCollectionAction(
  input: KnowledgeCollectionWriteInput,
): Promise<KnowledgeCollectionRow> {
  const user = await requireAdmin();

  const name = input.name?.trim();
  if (!name) throw new Error("Name is required");
  assertValidVisibility(input.visibility);

  // teamIds[] is the source of truth; legacy single teamId stays synced to
  // teamIds[0] for back-compat readers.
  const teamIds = resolveTeamIds({ teamIds: input.teamIds ?? null });

  const [collection] = await db
    .insert(AsafeKnowledgeCollectionTable)
    .values({
      name,
      description: input.description?.trim() || null,
      visibility: normalizeWriteVisibility(input.visibility ?? "company"),
      teamId: teamIds?.[0] ?? null,
      teamIds,
      createdBy: user.id,
    })
    .returning();

  return collection;
}

export async function updateKnowledgeCollectionAction(
  id: string,
  input: Partial<KnowledgeCollectionWriteInput>,
): Promise<KnowledgeCollectionRow> {
  const user = await requireUser();

  await loadCollectionOrThrow(id);

  // Owner and org admins hold manage on the unified model.
  const allowed = await canAccess(
    "knowledge_collection",
    id,
    user.id,
    "manage",
  );
  if (!allowed) throw new Error("Forbidden");

  assertValidVisibility(input.visibility);
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Name is required");
  }

  const update: Partial<typeof AsafeKnowledgeCollectionTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.description !== undefined) {
    update.description = input.description?.trim() || null;
  }
  if (input.visibility !== undefined) {
    update.visibility = normalizeWriteVisibility(input.visibility);
  }
  if (input.teamIds !== undefined) {
    const teamIds = resolveTeamIds({ teamIds: input.teamIds ?? null });
    update.teamIds = teamIds;
    update.teamId = teamIds?.[0] ?? null;
  }

  const [updated] = await db
    .update(AsafeKnowledgeCollectionTable)
    .set(update)
    .where(eq(AsafeKnowledgeCollectionTable.id, id))
    .returning();

  return updated;
}

export async function deleteKnowledgeCollectionAction(
  id: string,
): Promise<void> {
  await requireAdmin();
  await loadCollectionOrThrow(id);

  // Remove the chunks first so a deleted collection never leaves orphaned
  // (still retrievable) content behind.
  await db
    .delete(AsafeDocumentChunkTable)
    .where(eq(AsafeDocumentChunkTable.collectionId, id));
  await db
    .delete(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, id));
}

export interface IngestKnowledgeTextResult {
  chunks: number;
  sourceRef: string;
}

export async function ingestKnowledgeTextAction(input: {
  collectionId: string;
  text: string;
  sourceRef?: string;
}): Promise<IngestKnowledgeTextResult> {
  await requireAdmin();

  if (!input.collectionId) throw new Error("collectionId required");
  const text = input.text?.trim();
  if (!text) throw new Error("Text is required");

  await loadCollectionOrThrow(input.collectionId);

  const sourceRef = input.sourceRef?.trim() || "manual";
  const chunks = await ingestDocument(text, {
    collectionId: input.collectionId,
    sourceRef,
  });

  return { chunks, sourceRef };
}

export async function deleteKnowledgeDocumentAction(input: {
  collectionId: string;
  sourceRef: string;
}): Promise<{ deletedChunks: number }> {
  await requireAdmin();

  if (!input.collectionId || !input.sourceRef) {
    throw new Error("collectionId and sourceRef required");
  }
  await loadCollectionOrThrow(input.collectionId);

  const result = await db
    .delete(AsafeDocumentChunkTable)
    .where(
      and(
        eq(AsafeDocumentChunkTable.collectionId, input.collectionId),
        eq(AsafeDocumentChunkTable.sourceRef, input.sourceRef),
      ),
    )
    .returning({ id: AsafeDocumentChunkTable.id });

  if (result.length === 0) {
    throw new Error("Document not found");
  }
  return { deletedChunks: result.length };
}
