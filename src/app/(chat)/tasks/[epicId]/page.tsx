import { getSession } from "auth/server";
import { epicRepository } from "lib/db/repository";
import { notFound, redirect } from "next/navigation";

import { TaskBoard } from "@/components/tasks/task-board";

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
  const epic = await epicRepository.getEpicById(epicId);
  if (!epic) notFound();
  // Use notFound() (not 403) to avoid confirming a private epic's existence.
  if (!(await epicRepository.canUserReadEpic(epic, session.user.id))) notFound();
  const tasks = await epicRepository.listTasksForEpic(epicId);

  return <TaskBoard epicId={epicId} initialData={{ ...epic, tasks }} />;
}
