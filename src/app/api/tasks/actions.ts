"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import type {
  EpicEntity,
  EpicSummary,
  EpicWithTasks,
  TaskEntity,
} from "lib/db/pg/repositories/epic-repository.pg";
import { epicRepository } from "lib/db/repository";

/**
 * Server actions for the Epics + Tasks feature. All exported actions return a
 * structured {@link ActionResult} instead of throwing so that user-readable
 * messages survive the RSC boundary (production Next.js masks thrown errors
 * into an opaque digest). Internal `*OrThrow` helpers keep the throwing path
 * so they remain reusable by other server code.
 */

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// ---------------------------------------------------------------------------
// Epic actions
// ---------------------------------------------------------------------------

export async function createEpicAction(input: {
  title: string;
  description?: string | null;
  status?: "backlog" | "in_progress" | "done";
  priority?: "low" | "medium" | "high" | "critical";
  labels?: string[];
  teamId?: string | null;
  visibility?: "private" | "shared" | "team" | "company";
}): Promise<ActionResult<EpicEntity>> {
  return toActionResult(async () => {
    const ownerId = await requireUserId();
    if (!input.title?.trim()) throw new Error("Title is required");
    return epicRepository.createEpic({ ...input, ownerId });
  });
}

export async function updateEpicAction(
  epicId: string,
  input: Partial<{
    title: string;
    description: string | null;
    status: "backlog" | "in_progress" | "done";
    priority: "low" | "medium" | "high" | "critical";
    labels: string[];
    teamId: string | null;
    visibility: "private" | "shared" | "team" | "company";
  }>,
): Promise<ActionResult<EpicEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    const epic = await epicRepository.getEpicById(epicId);
    if (!epic) throw new Error("Epic not found");
    if (epic.ownerId !== userId) throw new Error("Forbidden");
    const updated = await epicRepository.updateEpic(epicId, input);
    if (!updated) throw new Error("Update failed");
    return updated;
  });
}

export async function deleteEpicAction(
  epicId: string,
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    const epic = await epicRepository.getEpicById(epicId);
    if (!epic) throw new Error("Epic not found");
    if (epic.ownerId !== userId) throw new Error("Forbidden");
    await epicRepository.deleteEpic(epicId);
  });
}

export async function listEpicsAction(
  teamId?: string | null,
): Promise<ActionResult<EpicSummary[]>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return epicRepository.listEpicsForUser(userId, teamId);
  });
}

export async function getEpicWithTasksAction(
  epicId: string,
): Promise<ActionResult<EpicWithTasks>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    const epic = await epicRepository.getEpicById(epicId);
    if (!epic) throw new Error("Epic not found");
    if (!(await epicRepository.canUserReadEpic(epic, userId)))
      throw new Error("Forbidden");
    const tasks = await epicRepository.listTasksForEpic(epicId);
    return { ...epic, tasks };
  });
}

// ---------------------------------------------------------------------------
// Task actions
// ---------------------------------------------------------------------------

export async function createTaskAction(
  epicId: string,
  input: {
    title: string;
    description?: string | null;
    type?: "story" | "task" | "bug";
    status?: "todo" | "in_progress" | "done";
    priority?: "low" | "medium" | "high" | "critical";
    assigneeId?: string | null;
    labels?: string[];
    sortOrder?: number;
  },
): Promise<ActionResult<TaskEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    if (!input.title?.trim()) throw new Error("Title is required");
    const epic = await epicRepository.getEpicById(epicId);
    if (!epic) throw new Error("Epic not found");
    if (epic.ownerId !== userId) throw new Error("Forbidden");
    return epicRepository.createTask({
      ...input,
      epicId,
      teamId: epic.teamId,
      createdBy: userId,
    });
  });
}

export async function updateTaskAction(
  taskId: string,
  input: Partial<{
    title: string;
    description: string | null;
    type: "story" | "task" | "bug";
    status: "todo" | "in_progress" | "done";
    priority: "low" | "medium" | "high" | "critical";
    assigneeId: string | null;
    labels: string[];
    sortOrder: number;
  }>,
): Promise<ActionResult<TaskEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    const task = await epicRepository.getTaskById(taskId);
    if (!task) throw new Error("Task not found");
    const epic = await epicRepository.getEpicById(task.epicId);
    if (!epic || epic.ownerId !== userId) throw new Error("Forbidden");
    const updated = await epicRepository.updateTask(taskId, input);
    if (!updated) throw new Error("Update failed");
    return updated;
  });
}

export async function deleteTaskAction(
  taskId: string,
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    const task = await epicRepository.getTaskById(taskId);
    if (!task) throw new Error("Task not found");
    const epic = await epicRepository.getEpicById(task.epicId);
    if (!epic || epic.ownerId !== userId) throw new Error("Forbidden");
    await epicRepository.deleteTask(taskId);
  });
}

export async function reorderTasksAction(
  epicId: string,
  orderedIds: string[],
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    const epic = await epicRepository.getEpicById(epicId);
    if (!epic) throw new Error("Epic not found");
    if (epic.ownerId !== userId) throw new Error("Forbidden");
    await epicRepository.reorderTasks(epicId, orderedIds);
  });
}
