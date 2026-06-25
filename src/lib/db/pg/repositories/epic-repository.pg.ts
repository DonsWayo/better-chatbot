import { and, asc, desc, eq, exists, inArray, or } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AsafeEpicTable,
  AsafeTaskTable,
  AsafeTeamMemberTable,
  UserTable,
} from "../schema.pg";

export type EpicEntity = typeof AsafeEpicTable.$inferSelect;
export type TaskEntity = typeof AsafeTaskTable.$inferSelect;

export interface EpicWithTasks extends EpicEntity {
  tasks: TaskEntity[];
}

export interface EpicSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  teamId: string | null;
  ownerId: string;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  taskTotal: number;
  taskDone: number;
  ownerName?: string;
  ownerImage?: string;
}

/** Visibility predicate used in the list query (no JOIN required). */
const visibleToUser = (userId: string) =>
  or(
    eq(AsafeEpicTable.ownerId, userId),
    inArray(AsafeEpicTable.visibility, ["company", "shared"] as const),
    and(
      eq(AsafeEpicTable.visibility, "team"),
      exists(
        db
          .select()
          .from(AsafeTeamMemberTable)
          .where(
            and(
              eq(AsafeTeamMemberTable.teamId, AsafeEpicTable.teamId),
              eq(AsafeTeamMemberTable.userId, userId),
            ),
          ),
      ),
    ),
  );

export const pgEpicRepository = {
  // -------------------------------------------------------------------------
  // Epics
  // -------------------------------------------------------------------------

  /**
   * Returns true if `userId` is allowed to read `epic`.
   * Visibility rules: owner always, "company"/"shared" = any auth user,
   * "team" = owner or team member, "private" = owner only.
   */
  async canUserReadEpic(epic: EpicEntity, userId: string): Promise<boolean> {
    if (epic.ownerId === userId) return true;
    if (epic.visibility === "company" || epic.visibility === "shared")
      return true;
    if (epic.visibility === "team" && epic.teamId) {
      const [row] = await db
        .select({ userId: AsafeTeamMemberTable.userId })
        .from(AsafeTeamMemberTable)
        .where(
          and(
            eq(AsafeTeamMemberTable.teamId, epic.teamId),
            eq(AsafeTeamMemberTable.userId, userId),
          ),
        )
        .limit(1);
      return !!row;
    }
    return false;
  },

  async createEpic(input: {
    ownerId: string;
    title: string;
    description?: string | null;
    status?: "backlog" | "in_progress" | "done";
    priority?: "low" | "medium" | "high" | "critical";
    labels?: string[];
    teamId?: string | null;
    visibility?: "private" | "shared" | "team" | "company";
  }): Promise<EpicEntity> {
    const [epic] = await db
      .insert(AsafeEpicTable)
      .values({
        ownerId: input.ownerId,
        title: input.title.trim(),
        description: input.description ?? null,
        status: input.status ?? "backlog",
        priority: input.priority ?? "medium",
        labels: input.labels ?? [],
        teamId: input.teamId ?? null,
        visibility: input.visibility ?? "team",
      })
      .returning();
    if (!epic) throw new Error("Epic insert returned no rows");
    return epic;
  },

  async getEpicById(id: string): Promise<EpicEntity | null> {
    const [epic] = await db
      .select()
      .from(AsafeEpicTable)
      .where(eq(AsafeEpicTable.id, id))
      .limit(1);
    return epic ?? null;
  },

  async getEpicWithTasks(id: string): Promise<EpicWithTasks | null> {
    const [epic] = await db
      .select()
      .from(AsafeEpicTable)
      .where(eq(AsafeEpicTable.id, id))
      .limit(1);
    if (!epic) return null;

    const tasks = await db
      .select()
      .from(AsafeTaskTable)
      .where(eq(AsafeTaskTable.epicId, id))
      .orderBy(asc(AsafeTaskTable.sortOrder), asc(AsafeTaskTable.createdAt));

    return { ...epic, tasks };
  },

  /**
   * List epics visible to `userId`. Visibility rules match the document model:
   *   - owner always sees their own epics;
   *   - "company" → everyone;
   *   - "team"    → team members when teamId set;
   *   - "private" → owner only.
   *
   * When `teamId` is supplied the list is additionally filtered to that team.
   */
  async listEpicsForUser(
    userId: string,
    teamId?: string | null,
  ): Promise<EpicSummary[]> {
    // EXISTS-based visibility — no row multiplication risk.
    const rows = await db
      .select({
        id: AsafeEpicTable.id,
        title: AsafeEpicTable.title,
        status: AsafeEpicTable.status,
        priority: AsafeEpicTable.priority,
        labels: AsafeEpicTable.labels,
        teamId: AsafeEpicTable.teamId,
        ownerId: AsafeEpicTable.ownerId,
        visibility: AsafeEpicTable.visibility,
        createdAt: AsafeEpicTable.createdAt,
        updatedAt: AsafeEpicTable.updatedAt,
        ownerName: UserTable.name,
        ownerImage: UserTable.image,
      })
      .from(AsafeEpicTable)
      .leftJoin(UserTable, eq(UserTable.id, AsafeEpicTable.ownerId))
      .where(
        and(
          visibleToUser(userId),
          teamId ? eq(AsafeEpicTable.teamId, teamId) : undefined,
        ),
      )
      .orderBy(desc(AsafeEpicTable.updatedAt));

    if (rows.length === 0) return [];

    // Fetch task counts per epic in a single query.
    const epicIds = rows.map((r) => r.id);
    const allTasks = await db
      .select({
        epicId: AsafeTaskTable.epicId,
        status: AsafeTaskTable.status,
      })
      .from(AsafeTaskTable)
      .where(inArray(AsafeTaskTable.epicId, epicIds));

    const taskCountMap = new Map<string, { total: number; done: number }>();
    for (const task of allTasks) {
      const current = taskCountMap.get(task.epicId) ?? { total: 0, done: 0 };
      current.total += 1;
      if (task.status === "done") current.done += 1;
      taskCountMap.set(task.epicId, current);
    }

    return rows.map((row) => {
      const counts = taskCountMap.get(row.id) ?? { total: 0, done: 0 };
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        labels: (row.labels as string[]) ?? [],
        teamId: row.teamId,
        ownerId: row.ownerId,
        visibility: row.visibility,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        taskTotal: counts.total,
        taskDone: counts.done,
        ownerName: row.ownerName ?? undefined,
        ownerImage: row.ownerImage ?? undefined,
      };
    });
  },

  async updateEpic(
    id: string,
    input: Partial<{
      title: string;
      description: string | null;
      status: "backlog" | "in_progress" | "done";
      priority: "low" | "medium" | "high" | "critical";
      labels: string[];
      teamId: string | null;
      visibility: "private" | "shared" | "team" | "company";
    }>,
  ): Promise<EpicEntity | null> {
    const [updated] = await db
      .update(AsafeEpicTable)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(AsafeEpicTable.id, id))
      .returning();
    return updated ?? null;
  },

  async deleteEpic(id: string): Promise<void> {
    await db.delete(AsafeEpicTable).where(eq(AsafeEpicTable.id, id));
  },

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  async createTask(input: {
    epicId: string;
    title: string;
    description?: string | null;
    type?: "story" | "task" | "bug";
    status?: "todo" | "in_progress" | "done";
    priority?: "low" | "medium" | "high" | "critical";
    assigneeId?: string | null;
    labels?: string[];
    teamId?: string | null;
    createdBy?: string | null;
    sortOrder?: number;
  }): Promise<TaskEntity> {
    const [task] = await db
      .insert(AsafeTaskTable)
      .values({
        epicId: input.epicId,
        title: input.title.trim(),
        description: input.description ?? null,
        type: input.type ?? "task",
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        assigneeId: input.assigneeId ?? null,
        labels: input.labels ?? [],
        teamId: input.teamId ?? null,
        createdBy: input.createdBy ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    if (!task) throw new Error("Task insert returned no rows");
    return task;
  },

  async getTaskById(id: string): Promise<TaskEntity | null> {
    const [task] = await db
      .select()
      .from(AsafeTaskTable)
      .where(eq(AsafeTaskTable.id, id))
      .limit(1);
    return task ?? null;
  },

  async listTasksForEpic(epicId: string): Promise<TaskEntity[]> {
    return db
      .select()
      .from(AsafeTaskTable)
      .where(eq(AsafeTaskTable.epicId, epicId))
      .orderBy(asc(AsafeTaskTable.sortOrder), asc(AsafeTaskTable.createdAt));
  },

  async updateTask(
    id: string,
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
  ): Promise<TaskEntity | null> {
    const [updated] = await db
      .update(AsafeTaskTable)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(AsafeTaskTable.id, id))
      .returning();
    return updated ?? null;
  },

  async deleteTask(id: string): Promise<void> {
    await db.delete(AsafeTaskTable).where(eq(AsafeTaskTable.id, id));
  },

  /**
   * Bulk-update `sortOrder` on a set of tasks — used for drag-and-drop
   * reordering. `orderedIds` is the desired order (index = new sortOrder).
   * Wrapped in a transaction so a partial failure rolls back entirely.
   */
  async reorderTasks(epicId: string, orderedIds: string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    await db.transaction(async (tx) => {
      const results = await Promise.all(
        orderedIds.map((taskId, idx) =>
          tx
            .update(AsafeTaskTable)
            .set({ sortOrder: idx, updatedAt: new Date() })
            .where(
              and(
                eq(AsafeTaskTable.id, taskId),
                eq(AsafeTaskTable.epicId, epicId),
              ),
            )
            .returning({ id: AsafeTaskTable.id }),
        ),
      );
      const matched = results.flat().length;
      if (matched !== orderedIds.length) {
        throw new Error(
          `reorderTasks: expected ${orderedIds.length} updates, got ${matched} — stale IDs or epic mismatch`,
        );
      }
    });
  },
};
