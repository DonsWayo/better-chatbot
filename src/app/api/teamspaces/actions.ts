"use server";

import { type ActionResult, toActionResult } from "app-types/util";
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

// The folder mutations driven from the sidebar return a structured
// {@link ActionResult} rather than throwing: production Next.js masks errors
// thrown from a Server Action into an opaque 500 ("digest"), so the
// "Unauthorized" / ownership reasons surfaced by the folders lib would never
// reach the sidebar's handleErrorWithToast. The auth LOGIC is unchanged — only
// the delivery moves from throw to a returned result.

export async function createFolderAction(input: {
  name: string;
  teamId?: string | null;
  parentId?: string | null;
}): Promise<ActionResult<TeamspaceFolder>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return createFolder({
      name: input.name,
      teamId: input.teamId ?? null,
      parentId: input.parentId ?? null,
      userId,
    });
  });
}

export async function renameFolderAction(
  folderId: string,
  name: string,
): Promise<ActionResult<TeamspaceFolder>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return renameFolder(folderId, name, userId);
  });
}

export async function deleteFolderAction(
  folderId: string,
): Promise<ActionResult> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    await deleteFolder(folderId, userId);
  });
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
