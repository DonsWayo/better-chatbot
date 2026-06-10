"use server";

import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";
import { type MemoryMode, isMemoryMode } from "lib/memory/policy";
import { deleteAllMemories, deleteMemory } from "lib/memory/store";

// Internal-UI mutations for the memory manager → Server Actions only
// (docs/CLAUDE.md decision matrix). The SWR list lives at GET /api/memory;
// callers `mutate("/api/memory")` after these actions.

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.user.id) throw new Error("Unauthorized");
  return session.user.id;
}

/**
 * Save the user's memory tri-state into user.preferences (merging the
 * existing personalization fields). Turning memory OFF is the destructive
 * reset path (docs/design/user-memory.md): it permanently deletes all stored
 * memories — the UI confirms before calling this with "off".
 */
export async function setMemoryModeAction(mode: MemoryMode): Promise<void> {
  if (!isMemoryMode(mode)) throw new Error("Invalid memory mode");
  const userId = await requireUserId();

  if (mode === "off") {
    await deleteAllMemories(userId);
  }
  const existing = (await userRepository.getPreferences(userId)) ?? {};
  await userRepository.updatePreferences(userId, {
    ...existing,
    memoryMode: mode,
  });
}

/** Per-item erasure (owner-scoped in the store). */
export async function deleteMemoryAction(id: string): Promise<void> {
  const userId = await requireUserId();
  await deleteMemory(id, userId);
}

/** Clear-all: permanently delete every memory for the current user. */
export async function deleteAllMemoriesAction(): Promise<void> {
  const userId = await requireUserId();
  await deleteAllMemories(userId);
}
