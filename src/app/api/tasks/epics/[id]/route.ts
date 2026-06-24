import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/tasks/epics/[id] — get epic with all tasks. */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const epic = await epicRepository.getEpicWithTasks(id);
  if (!epic) {
    return NextResponse.json({ error: "Epic not found" }, { status: 404 });
  }

  return NextResponse.json({ epic });
}

/** PATCH /api/tasks/epics/[id] — update epic fields (owner only). */
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const epic = await epicRepository.getEpicById(id);
  if (!epic) {
    return NextResponse.json({ error: "Epic not found" }, { status: 404 });
  }
  if (epic.ownerId !== session.user.id) {
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
  try {
    const updated = await epicRepository.updateEpic(id, {
      title: typeof input.title === "string" ? input.title : undefined,
      description:
        typeof input.description === "string" ||
        input.description === null
          ? (input.description as string | null)
          : undefined,
      status: input.status as "backlog" | "in_progress" | "done" | undefined,
      priority: input.priority as
        | "low"
        | "medium"
        | "high"
        | "critical"
        | undefined,
      labels: Array.isArray(input.labels)
        ? (input.labels as string[])
        : undefined,
      teamId:
        typeof input.teamId === "string" || input.teamId === null
          ? (input.teamId as string | null)
          : undefined,
      visibility: input.visibility as
        | "private"
        | "shared"
        | "team"
        | "company"
        | undefined,
    });
    return NextResponse.json({ epic: updated });
  } catch (err) {
    console.error("[PATCH /api/tasks/epics/[id]]", err);
    return NextResponse.json(
      { error: "Failed to update epic" },
      { status: 500 },
    );
  }
}

/** DELETE /api/tasks/epics/[id] — delete epic and all its tasks (owner only). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const epic = await epicRepository.getEpicById(id);
  if (!epic) {
    return NextResponse.json({ error: "Epic not found" }, { status: 404 });
  }
  if (epic.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await epicRepository.deleteEpic(id);
  return NextResponse.json({ ok: true });
}
