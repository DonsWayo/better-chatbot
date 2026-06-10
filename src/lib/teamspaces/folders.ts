import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  AsafeTeamMemberTable,
  AsafeTeamTable,
  ChatThreadTable,
  FolderTable,
} from "lib/db/pg/schema.pg";

/**
 * Teamspaces phase 1 — folders + read-only shared thread snapshots.
 *
 * Visibility / access rules (the source of truth for this module):
 * - A folder with teamId = null is a personal folder, visible only to its
 *   owner. A folder with teamId set is a team folder, visible to every
 *   member of that team.
 * - Moving a thread INTO a team folder sets the thread's visibility to
 *   "team"; moving it OUT (to a personal folder or to no folder) resets it
 *   to "private". Visibility "team" without a containing team folder is
 *   inert — nobody but the owner can read the thread.
 * - A "team"-visible thread is readable (READ-ONLY) by members of the
 *   containing folder's team. Only the thread owner can ever write.
 * - Folder management (rename/delete) is allowed for the folder owner or an
 *   admin of the folder's team.
 */

export type TeamspaceVisibility = "private" | "team";

export interface TeamspaceFolder {
  id: string;
  name: string;
  parentId: string | null;
  teamId: string | null;
  ownerId: string;
  visibility: TeamspaceVisibility;
  createdAt: Date;
  updatedAt: Date;
  /** Resolved display name of the owning team (team folders only). */
  teamName?: string | null;
}

export interface TeamspaceTeam {
  id: string;
  name: string;
  role: string;
}

export interface FolderThreadItem {
  id: string;
  title: string;
  userId: string;
  visibility: TeamspaceVisibility;
  createdAt: Date;
}

// ── membership helpers ───────────────────────────────────────────────────────

async function getMembershipRole(
  teamId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: AsafeTeamMemberTable.role })
    .from(AsafeTeamMemberTable)
    .where(
      and(
        eq(AsafeTeamMemberTable.teamId, teamId),
        eq(AsafeTeamMemberTable.userId, userId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

export async function isTeamMember(
  teamId: string,
  userId: string,
): Promise<boolean> {
  return (await getMembershipRole(teamId, userId)) !== null;
}

export async function isTeamAdmin(
  teamId: string,
  userId: string,
): Promise<boolean> {
  return (await getMembershipRole(teamId, userId)) === "admin";
}

/** Teams the user belongs to — used for the folder team picker. */
export async function listUserTeams(userId: string): Promise<TeamspaceTeam[]> {
  const rows = await db
    .select({
      id: AsafeTeamTable.id,
      name: AsafeTeamTable.name,
      role: AsafeTeamMemberTable.role,
    })
    .from(AsafeTeamMemberTable)
    .innerJoin(
      AsafeTeamTable,
      eq(AsafeTeamMemberTable.teamId, AsafeTeamTable.id),
    )
    .where(eq(AsafeTeamMemberTable.userId, userId));
  return rows;
}

// ── folder CRUD ──────────────────────────────────────────────────────────────

async function getFolder(folderId: string): Promise<TeamspaceFolder | null> {
  const [row] = await db
    .select()
    .from(FolderTable)
    .where(eq(FolderTable.id, folderId))
    .limit(1);
  return (row as TeamspaceFolder | undefined) ?? null;
}

async function canManageFolder(
  folder: TeamspaceFolder,
  userId: string,
): Promise<boolean> {
  if (folder.ownerId === userId) return true;
  if (folder.teamId) return isTeamAdmin(folder.teamId, userId);
  return false;
}

export async function createFolder(input: {
  name: string;
  userId: string;
  teamId?: string | null;
  parentId?: string | null;
}): Promise<TeamspaceFolder> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Folder name is required");
  }
  const teamId = input.teamId ?? null;
  if (teamId && !(await isTeamMember(teamId, input.userId))) {
    throw new Error("You are not a member of this team");
  }
  if (input.parentId) {
    const parent = await getFolder(input.parentId);
    if (!parent) {
      throw new Error("Parent folder not found");
    }
    if ((parent.teamId ?? null) !== teamId) {
      throw new Error("Parent folder belongs to a different teamspace");
    }
    if (!parent.teamId && parent.ownerId !== input.userId) {
      throw new Error("You cannot create folders inside this folder");
    }
  }
  const [row] = await db
    .insert(FolderTable)
    .values({
      name,
      ownerId: input.userId,
      teamId,
      parentId: input.parentId ?? null,
      // Team folders are shared by definition; personal folders are private.
      visibility: teamId ? "team" : "private",
    })
    .returning();
  return row as TeamspaceFolder;
}

export async function renameFolder(
  folderId: string,
  name: string,
  userId: string,
): Promise<TeamspaceFolder> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Folder name is required");
  }
  const folder = await getFolder(folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }
  if (!(await canManageFolder(folder, userId))) {
    throw new Error("You do not have permission to rename this folder");
  }
  const [row] = await db
    .update(FolderTable)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(FolderTable.id, folderId))
    .returning();
  return row as TeamspaceFolder;
}

export async function deleteFolder(
  folderId: string,
  userId: string,
): Promise<void> {
  const folder = await getFolder(folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }
  if (!(await canManageFolder(folder, userId))) {
    throw new Error("You do not have permission to delete this folder");
  }
  // Threads inside become folderless via ON DELETE SET NULL; reset their
  // visibility to private so nothing stays "team"-marked without a team
  // folder to anchor the membership check.
  await db
    .update(ChatThreadTable)
    .set({ visibility: "private" })
    .where(eq(ChatThreadTable.folderId, folderId));
  await db.delete(FolderTable).where(eq(FolderTable.id, folderId));
}

/**
 * Flat list (parentId links — UI nests) of the user's personal folders plus
 * every folder of every team the user belongs to.
 */
export async function listFoldersForUser(
  userId: string,
): Promise<TeamspaceFolder[]> {
  const teams = await listUserTeams(userId);
  const teamIds = teams.map((t) => t.id);
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const where =
    teamIds.length > 0
      ? or(
          and(eq(FolderTable.ownerId, userId), isNull(FolderTable.teamId)),
          inArray(FolderTable.teamId, teamIds),
        )
      : and(eq(FolderTable.ownerId, userId), isNull(FolderTable.teamId));

  const rows = await db
    .select()
    .from(FolderTable)
    .where(where)
    .orderBy(FolderTable.name);

  return (rows as TeamspaceFolder[]).map((row) => ({
    ...row,
    teamName: row.teamId ? (teamNameById.get(row.teamId) ?? null) : null,
  }));
}

// ── thread placement & visibility ────────────────────────────────────────────

async function getThread(threadId: string): Promise<{
  id: string;
  userId: string;
  folderId: string | null;
  visibility: TeamspaceVisibility;
} | null> {
  const [row] = await db
    .select({
      id: ChatThreadTable.id,
      userId: ChatThreadTable.userId,
      folderId: ChatThreadTable.folderId,
      visibility: ChatThreadTable.visibility,
    })
    .from(ChatThreadTable)
    .where(eq(ChatThreadTable.id, threadId))
    .limit(1);
  return row ?? null;
}

/**
 * Move a thread into a folder (or out of all folders with folderId = null).
 * Thread owner only.
 *
 * Visibility rule: moving into a TEAM folder sets visibility "team"; moving
 * into a personal folder or out of folders resets it to "private".
 */
export async function moveThreadToFolder(
  threadId: string,
  folderId: string | null,
  userId: string,
): Promise<void> {
  const thread = await getThread(threadId);
  if (!thread) {
    throw new Error("Thread not found");
  }
  if (thread.userId !== userId) {
    throw new Error("Only the thread owner can move it");
  }

  let visibility: TeamspaceVisibility = "private";
  if (folderId) {
    const folder = await getFolder(folderId);
    if (!folder) {
      throw new Error("Folder not found");
    }
    const allowed =
      folder.ownerId === userId ||
      (folder.teamId ? await isTeamMember(folder.teamId, userId) : false);
    if (!allowed) {
      throw new Error("You do not have access to this folder");
    }
    visibility = folder.teamId ? "team" : "private";
  }

  await db
    .update(ChatThreadTable)
    .set({ folderId, visibility })
    .where(eq(ChatThreadTable.id, threadId));
}

/**
 * Explicitly set a thread's visibility. Thread owner only. Setting "team"
 * requires the thread to live in a team folder whose team the owner belongs
 * to (same membership requirement as moveThreadToFolder).
 */
export async function setThreadVisibility(
  threadId: string,
  visibility: TeamspaceVisibility,
  userId: string,
): Promise<void> {
  const thread = await getThread(threadId);
  if (!thread) {
    throw new Error("Thread not found");
  }
  if (thread.userId !== userId) {
    throw new Error("Only the thread owner can change its visibility");
  }
  if (visibility === "team") {
    if (!thread.folderId) {
      throw new Error("Move the thread into a team folder to share it");
    }
    const folder = await getFolder(thread.folderId);
    if (!folder?.teamId) {
      throw new Error("The thread's folder does not belong to a team");
    }
    if (!(await isTeamMember(folder.teamId, userId))) {
      throw new Error("You are not a member of this team");
    }
  }
  await db
    .update(ChatThreadTable)
    .set({ visibility })
    .where(eq(ChatThreadTable.id, threadId));
}

// ── read access ──────────────────────────────────────────────────────────────

/**
 * Read access gate used by the shared read-only view and folder listings.
 * True when the user owns the thread, OR the thread is "team"-visible inside
 * a team folder and the user is a member of that team.
 */
export async function canReadThread(
  threadId: string,
  userId: string,
): Promise<boolean> {
  const thread = await getThread(threadId);
  if (!thread) return false;
  if (thread.userId === userId) return true;
  if (thread.visibility !== "team") return false;
  if (!thread.folderId) return false;
  const folder = await getFolder(thread.folderId);
  if (!folder?.teamId) return false;
  return isTeamMember(folder.teamId, userId);
}

/**
 * Folder access gate (presence shape / heartbeats and other read paths):
 * the folder owner, or — for team folders — any member of the team.
 */
export async function canAccessFolder(
  folderId: string,
  userId: string,
): Promise<boolean> {
  const folder = await getFolder(folderId);
  if (!folder) return false;
  if (folder.ownerId === userId) return true;
  if (!folder.teamId) return false;
  return isTeamMember(folder.teamId, userId);
}

/**
 * True when a thread is actually shared: "team"-visible AND anchored in a
 * team folder. Used to gate collaborative chrome (presence avatars) on the
 * owner's own chat view — a private thread never shows presence.
 */
export async function isThreadShared(threadId: string): Promise<boolean> {
  const thread = await getThread(threadId);
  if (!thread) return false;
  if (thread.visibility !== "team") return false;
  if (!thread.folderId) return false;
  const folder = await getFolder(thread.folderId);
  return Boolean(folder?.teamId);
}

/** Team context of a shared thread (for the "Shared with <team>" banner). */
export async function getThreadTeam(
  threadId: string,
): Promise<{ id: string; name: string } | null> {
  const thread = await getThread(threadId);
  if (!thread?.folderId) return null;
  const folder = await getFolder(thread.folderId);
  if (!folder?.teamId) return null;
  const [team] = await db
    .select({ id: AsafeTeamTable.id, name: AsafeTeamTable.name })
    .from(AsafeTeamTable)
    .where(eq(AsafeTeamTable.id, folder.teamId))
    .limit(1);
  return team ?? null;
}

/**
 * Threads inside a folder the user may see: in a personal folder, only the
 * owner sees anything; in a team folder, members see their own threads plus
 * teammates' threads that are "team"-visible.
 */
export async function listThreadsInFolder(
  folderId: string,
  userId: string,
): Promise<FolderThreadItem[]> {
  const folder = await getFolder(folderId);
  if (!folder) {
    throw new Error("Folder not found");
  }
  const isMember = folder.teamId
    ? await isTeamMember(folder.teamId, userId)
    : false;
  if (folder.ownerId !== userId && !isMember) {
    throw new Error("You do not have access to this folder");
  }

  const rows = await db
    .select({
      id: ChatThreadTable.id,
      title: ChatThreadTable.title,
      userId: ChatThreadTable.userId,
      visibility: ChatThreadTable.visibility,
      createdAt: ChatThreadTable.createdAt,
    })
    .from(ChatThreadTable)
    .where(
      and(
        eq(ChatThreadTable.folderId, folderId),
        or(
          eq(ChatThreadTable.userId, userId),
          eq(ChatThreadTable.visibility, "team"),
        ),
      ),
    )
    .orderBy(ChatThreadTable.createdAt);

  // In a personal folder nobody else has access at all (guard above), and
  // "team" rows without a team are inert — filter them for non-members.
  return rows.filter(
    (row) => row.userId === userId || (folder.teamId !== null && isMember),
  );
}
