"use server";

import {
  type Archive,
  ArchiveCreateSchema,
  type ArchiveItem,
  ArchiveUpdateSchema,
} from "app-types/archive";
import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import { archiveRepository } from "lib/db/repository";

async function getUserId() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("User not found");
  }
  return userId;
}

// The mutating actions below return a structured {@link ActionResult} rather
// than throwing: production Next.js masks errors thrown from a Server Action
// into an opaque 500 ("digest"), so the user-instructional messages
// ("User not found", "Archive not found or access denied", Zod validation
// errors) would never reach the client toast. Internal `*OrThrow` helpers keep
// the throwing logic for any server-side caller that prefers it.

async function createArchiveOrThrow(data: {
  name: string;
  description?: string;
}): Promise<Archive> {
  const userId = await getUserId();
  const validatedData = ArchiveCreateSchema.parse(data);

  return await archiveRepository.createArchive({
    name: validatedData.name,
    description: validatedData.description || null,
    userId,
  });
}

export async function createArchiveAction(data: {
  name: string;
  description?: string;
}): Promise<ActionResult<Archive>> {
  return toActionResult(() => createArchiveOrThrow(data));
}

async function updateArchiveOrThrow(
  id: string,
  data: { name?: string; description?: string },
): Promise<Archive> {
  const userId = await getUserId();

  // Check if user owns the archive
  const existingArchive = await archiveRepository.getArchiveById(id);
  if (!existingArchive || existingArchive.userId !== userId) {
    throw new Error("Archive not found or access denied");
  }

  const validatedData = ArchiveUpdateSchema.parse(data);

  return await archiveRepository.updateArchive(id, {
    name: validatedData.name,
    description: validatedData.description || null,
  });
}

export async function updateArchiveAction(
  id: string,
  data: { name?: string; description?: string },
): Promise<ActionResult<Archive>> {
  return toActionResult(() => updateArchiveOrThrow(id, data));
}

async function deleteArchiveOrThrow(id: string): Promise<void> {
  const userId = await getUserId();

  // Check if user owns the archive
  const existingArchive = await archiveRepository.getArchiveById(id);
  if (!existingArchive || existingArchive.userId !== userId) {
    throw new Error("Archive not found or access denied");
  }

  await archiveRepository.deleteArchive(id);
}

export async function deleteArchiveAction(id: string): Promise<ActionResult> {
  return toActionResult(() => deleteArchiveOrThrow(id));
}

async function addItemToArchiveOrThrow(
  archiveId: string,
  itemId: string,
): Promise<ArchiveItem> {
  const userId = await getUserId();

  // Check if user owns the archive
  const existingArchive = await archiveRepository.getArchiveById(archiveId);
  if (!existingArchive || existingArchive.userId !== userId) {
    throw new Error("Archive not found or access denied");
  }

  return await archiveRepository.addItemToArchive(archiveId, itemId, userId);
}

export async function addItemToArchiveAction(
  archiveId: string,
  itemId: string,
): Promise<ActionResult<ArchiveItem>> {
  return toActionResult(() => addItemToArchiveOrThrow(archiveId, itemId));
}

export async function removeItemFromArchiveAction(
  archiveId: string,
  itemId: string,
) {
  const userId = await getUserId();

  // Check if user owns the archive
  const existingArchive = await archiveRepository.getArchiveById(archiveId);
  if (!existingArchive || existingArchive.userId !== userId) {
    throw new Error("Archive not found or access denied");
  }

  await archiveRepository.removeItemFromArchive(archiveId, itemId);
}

export async function getItemArchivesAction(itemId: string) {
  const userId = await getUserId();
  return await archiveRepository.getItemArchives(itemId, userId);
}
