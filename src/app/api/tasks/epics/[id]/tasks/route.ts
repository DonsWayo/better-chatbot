import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/tasks/epics/[id]/tasks — list tasks for an epic. */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const tasks = await epicRepository.listTasksForEpic(id);
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[GET /api/tasks/epics/[id]/tasks]", err);
    return NextResponse.json(
      { error: "Failed to list tasks" },
      { status: 500 },
    );
  }
}

/** POST /api/tasks/epics/[id]/tasks — create a task under an epic. */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: epicId } = await params;
  const epic = await epicRepository.getEpicById(epicId);
  if (!epic) {
    return NextResponse.json({ error: "Epic not found" }, { status: 404 });
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
  if (!input.title || typeof input.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const task = await epicRepository.createTask({
      epicId,
      title: input.title,
      description:
        typeof input.description === "string" ? input.description : null,
      type: input.type as "story" | "task" | "bug" | undefined,
      status: input.status as "todo" | "in_progress" | "done" | undefined,
      priority: input.priority as
        | "low"
        | "medium"
        | "high"
        | "critical"
        | undefined,
      assigneeId:
        typeof input.assigneeId === "string" ? input.assigneeId : null,
      labels: Array.isArray(input.labels) ? (input.labels as string[]) : [],
      teamId: epic.teamId,
      createdBy: session.user.id,
      sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : 0,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tasks/epics/[id]/tasks]", err);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}
