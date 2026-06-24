import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { notFound, redirect } from "next/navigation";

import { TaskBoard } from "@/components/tasks/task-board";

/**
 * /tasks/[epicId] — the task board for a single epic. Shows tasks grouped by
 * status (Todo / In Progress / Done) with inline add, checkboxes, and a
 * slide-out sheet for full task detail.
 */
export const dynamic = "force-dynamic";

export default async function EpicTasksPage({
  params,
}: {
  params: Promise<{ epicId: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const { epicId } = await params;
  const epic = await epicRepository.getEpicWithTasks(epicId);
  if (!epic) notFound();

  return <TaskBoard epicId={epicId} initialData={epic} />;
}
