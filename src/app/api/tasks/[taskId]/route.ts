import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ taskId: string }> };

/** PATCH /api/tasks/[taskId] — update a task (epic owner only). */
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  try {
    const task = await epicRepository.getTaskById(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const parentEpic = await epicRepository.getEpicById(task.epicId);
    if (!parentEpic || parentEpic.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    const input = body as Record<string, unknown>;
    const updated = await epicRepository.updateTask(taskId, {
      title: typeof input.title === "string" ? input.title : undefined,
      description:
        typeof input.description === "string" || input.description === null
          ? (input.description as string | null)
          : undefined,
      type: input.type as "story" | "task" | "bug" | undefined,
      status: input.status as "todo" | "in_progress" | "done" | undefined,
      priority: input.priority as
        | "low"
        | "medium"
        | "high"
        | "critical"
        | undefined,
      assigneeId:
        typeof input.assigneeId === "string" || input.assigneeId === null
          ? (input.assigneeId as string | null)
          : undefined,
      labels: Array.isArray(input.labels)
        ? (input.labels as string[])
        : undefined,
      sortOrder:
        typeof input.sortOrder === "number" ? input.sortOrder : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ task: updated });
  } catch (err) {
    console.error("[PATCH /api/tasks/[taskId]]", { taskId, err });
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }
}

/** DELETE /api/tasks/[taskId] — delete a task (epic owner only). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  try {
    const task = await epicRepository.getTaskById(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const parentEpic = await epicRepository.getEpicById(task.epicId);
    if (!parentEpic || parentEpic.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await epicRepository.deleteTask(taskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/tasks/[taskId]]", { taskId, err });
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
