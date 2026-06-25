import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { redirect } from "next/navigation";

import { EpicsBoard } from "@/components/tasks/epics-board";

/**
 * /tasks — the Epics board. Lists all epics visible to the authenticated user,
 * grouped into Backlog / In Progress / Done Kanban columns.
 */
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const initialEpics = await epicRepository.listEpicsForUser(session.user.id);
  return <EpicsBoard initialEpics={initialEpics} />;
}
