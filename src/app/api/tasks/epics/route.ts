import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/tasks/epics — list epics visible to the caller. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");

  try {
    const epics = await epicRepository.listEpicsForUser(
      session.user.id,
      teamId ?? undefined,
    );
    return NextResponse.json({ epics });
  } catch (err) {
    console.error("[GET /api/tasks/epics]", err);
    return NextResponse.json(
      { error: "Failed to list epics" },
      { status: 500 },
    );
  }
}

/** POST /api/tasks/epics — create a new epic. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const epic = await epicRepository.createEpic({
      ownerId: session.user.id,
      title: input.title,
      description:
        typeof input.description === "string" ? input.description : null,
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
      teamId: typeof input.teamId === "string" ? input.teamId : null,
      visibility: input.visibility as
        | "private"
        | "shared"
        | "team"
        | "company"
        | undefined,
    });
    return NextResponse.json({ epic }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tasks/epics]", err);
    return NextResponse.json(
      { error: "Failed to create epic" },
      { status: 500 },
    );
  }
}
