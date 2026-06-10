"use server";

import { getSession } from "auth/server";
import {
  type TeamspaceFolder,
  type TeamspaceVisibility,
  createFolder,
  deleteFolder,
  moveThreadToFolder,
  renameFolder,
  setThreadVisibility,
} from "lib/teamspaces/folders";

async function requireUserId(): Promise<string> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export async function createFolderAction(input: {
  name: string;
  teamId?: string | null;
  parentId?: string | null;
}): Promise<TeamspaceFolder> {
  const userId = await requireUserId();
  return createFolder({
    name: input.name,
    teamId: input.teamId ?? null,
    parentId: input.parentId ?? null,
    userId,
  });
}

export async function renameFolderAction(
  folderId: string,
  name: string,
): Promise<TeamspaceFolder> {
  const userId = await requireUserId();
  return renameFolder(folderId, name, userId);
}

export async function deleteFolderAction(folderId: string): Promise<void> {
  const userId = await requireUserId();
  await deleteFolder(folderId, userId);
}

export async function moveThreadToFolderAction(
  threadId: string,
  folderId: string | null,
): Promise<void> {
  const userId = await requireUserId();
  await moveThreadToFolder(threadId, folderId, userId);
}

export async function setThreadVisibilityAction(
  threadId: string,
  visibility: TeamspaceVisibility,
): Promise<void> {
  const userId = await requireUserId();
  await setThreadVisibility(threadId, visibility, userId);
}
