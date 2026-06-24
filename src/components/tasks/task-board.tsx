"use client";

import {
  createTaskAction,
  deleteTaskAction,
  getEpicWithTasksAction,
  updateEpicAction,
  updateTaskAction,
} from "@/app/api/tasks/actions";
import type {
  EpicWithTasks,
  TaskEntity,
} from "lib/db/pg/repositories/epic-repository.pg";
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash,
} from "lucide-react";
import { notify } from "lib/notify";
import { cn } from "lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { Button } from "ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { Input } from "ui/input";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "ui/sheet";
import { Textarea } from "ui/textarea";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TaskStatus = "todo" | "in_progress" | "done";
type TaskType = "story" | "task" | "bug";

const STATUS_GROUPS: { status: TaskStatus; labelKey: string }[] = [
  { status: "todo", labelKey: "todo" },
  { status: "in_progress", labelKey: "inProgress" },
  { status: "done", labelKey: "done" },
];

const TYPE_ICON: Record<TaskType, React.ElementType> = {
  story: FileText,
  task: Circle,
  bug: Bug,
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Task detail sheet
// ---------------------------------------------------------------------------

function TaskSheet({
  task,
  open,
  onOpenChange,
  epicId,
}: {
  task: TaskEntity | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  epicId: string;
}) {
  const t = useTranslations("Tasks");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Re-populate fields when task prop changes (sheet opened for a different task).
  const prevTaskId = useRef<string | null>(null);
  if (task && task.id !== prevTaskId.current) {
    prevTaskId.current = task.id;
    setTitle(task.title);
    setDescription(task.description ?? "");
  }

  if (!task) return null;

  const handleSave = async () => {
    setSaving(true);
    const result = await updateTaskAction(task.id, { title, description });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(`task-board-${epicId}`);
    toast.success(t("saved"));
  };

  const handleStatusChange = async (status: TaskStatus) => {
    const result = await updateTaskAction(task.id, { status });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(`task-board-${epicId}`);
  };

  const handlePriorityChange = async (
    priority: "low" | "medium" | "high" | "critical",
  ) => {
    const result = await updateTaskAction(task.id, { priority });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(`task-board-${epicId}`);
  };

  const handleAiImprove = async () => {
    if (!description.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/documents/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "improve",
          content: description,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { result?: string };
        if (data.result) setDescription(data.result);
      } else {
        toast.error("AI improvement failed");
      }
    } catch {
      toast.error("AI improvement failed");
    } finally {
      setAiLoading(false);
    }
  };

  const TypeIcon = TYPE_ICON[task.type as TaskType] ?? Circle;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <TypeIcon className="size-4 text-muted-foreground shrink-0" />
            <SheetTitle className="text-base font-medium leading-tight">
              {task.title}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Status + Priority */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{t("status")}</Label>
              <Select
                defaultValue={task.status}
                onValueChange={(v) => handleStatusChange(v as TaskStatus)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">{t("todo")}</SelectItem>
                  <SelectItem value="in_progress">{t("inProgress")}</SelectItem>
                  <SelectItem value="done">{t("done")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{t("priority")}</Label>
              <Select
                defaultValue={task.priority}
                onValueChange={(v) =>
                  handlePriorityChange(
                    v as "low" | "medium" | "high" | "critical",
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("low")}</SelectItem>
                  <SelectItem value="medium">{t("medium")}</SelectItem>
                  <SelectItem value="high">{t("high")}</SelectItem>
                  <SelectItem value="critical">{t("critical")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className="text-xs">
              {t("title")}
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-desc" className="text-xs">
                {t("description")}
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-muted-foreground"
                onClick={handleAiImprove}
                disabled={aiLoading || !description.trim()}
              >
                {aiLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                {t("aiImprove")}
              </Button>
            </div>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="text-sm resize-none"
              placeholder="Add a description…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/60 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin mr-1" />
            ) : null}
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Single task row
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  epicId,
  onDelete,
  onClick,
}: {
  task: TaskEntity;
  epicId: string;
  onDelete: (id: string) => void;
  onClick: (task: TaskEntity) => void;
}) {
  const t = useTranslations("Tasks");
  const TypeIcon = TYPE_ICON[task.type as TaskType] ?? Circle;

  const toggleDone = async () => {
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    const result = await updateTaskAction(task.id, { status: next });
    if (!result.success) toast.error(result.error);
    else mutate(`task-board-${epicId}`);
  };

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
      {/* Done checkbox */}
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        onClick={toggleDone}
        aria-label={task.status === "done" ? "Mark incomplete" : "Mark done"}
      >
        <CheckCircle2
          className={cn(
            "size-4",
            task.status === "done"
              ? "text-green-500 fill-green-100 dark:fill-green-900"
              : "text-muted-foreground/40",
          )}
        />
      </button>

      {/* Type icon */}
      <TypeIcon className="size-3.5 text-muted-foreground shrink-0" />

      {/* Title */}
      <button
        className={cn(
          "flex-1 text-sm text-left truncate",
          task.status === "done" && "line-through text-muted-foreground",
        )}
        onClick={() => onClick(task)}
      >
        {task.title}
      </button>

      {/* Priority dot */}
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          PRIORITY_DOT[task.priority],
        )}
        title={t(task.priority)}
      />

      {/* Overflow menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Task actions"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(task.id)}
          >
            <Trash className="size-3.5 mr-1" />
            {t("deleteTask")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline add-task input
// ---------------------------------------------------------------------------

function AddTaskRow({
  epicId,
  onAdded,
}: {
  epicId: string;
  onAdded: () => void;
}) {
  const t = useTranslations("Tasks");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setSubmitting(true);
    const result = await createTaskAction(epicId, { title: value });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setValue("");
    onAdded();
    toast.success(t("taskCreated"));
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Plus className="size-3.5 text-muted-foreground shrink-0" />
      <Input
        className="h-7 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 placeholder:text-muted-foreground/60"
        placeholder={t("newTask")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setValue("");
        }}
        disabled={submitting}
      />
      {submitting && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status group
// ---------------------------------------------------------------------------

function StatusGroup({
  label,
  tasks,
  epicId,
  onDelete,
  onTaskClick,
  onAdded,
  showAdd,
}: {
  label: string;
  tasks: TaskEntity[];
  epicId: string;
  onDelete: (id: string) => void;
  onTaskClick: (task: TaskEntity) => void;
  onAdded: () => void;
  showAdd: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-muted-foreground ml-1">
          {tasks.length}
        </span>
      </button>

      {!collapsed && (
        <div className="pb-1">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                epicId={epicId}
                onDelete={onDelete}
                onClick={onTaskClick}
              />
            ))
          ) : (
            <p className="text-xs text-muted-foreground px-4 py-2">
              No tasks
            </p>
          )}
          {showAdd && <AddTaskRow epicId={epicId} onAdded={onAdded} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main board
// ---------------------------------------------------------------------------

export function TaskBoard({
  epicId,
  initialData,
}: {
  epicId: string;
  initialData: EpicWithTasks;
}) {
  const t = useTranslations("Tasks");
  const [selectedTask, setSelectedTask] = useState<TaskEntity | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const { data } = useSWR<EpicWithTasks>(
    `task-board-${epicId}`,
    async () => {
      const result = await getEpicWithTasksAction(epicId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { fallbackData: initialData, revalidateOnFocus: false },
  );

  const epic = data ?? initialData;
  const tasks = epic.tasks ?? [];
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const pct =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const handleDelete = async (id: string) => {
    const ok = await notify.confirm({ description: t("deleteTaskConfirm") });
    if (!ok) return;
    const result = await deleteTaskAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(`task-board-${epicId}`);
  };

  const handleStatusChange = async (status: "backlog" | "in_progress" | "done") => {
    const result = await updateEpicAction(epicId, { status });
    if (!result.success) toast.error(result.error);
    else mutate(`task-board-${epicId}`);
  };

  const handleTaskClick = (task: TaskEntity) => {
    setSelectedTask(task);
    setSheetOpen(true);
  };

  const refresh = () => mutate(`task-board-${epicId}`);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border/60">
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/tasks"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {t("epics")}
          </Link>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold truncate">{epic.title}</h1>

            {/* Epic status */}
            <div className="flex items-center gap-2 mt-1.5">
              <Select
                defaultValue={epic.status}
                onValueChange={(v) =>
                  handleStatusChange(v as "backlog" | "in_progress" | "done")
                }
              >
                <SelectTrigger className="h-6 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">{t("backlog")}</SelectItem>
                  <SelectItem value="in_progress">{t("inProgress")}</SelectItem>
                  <SelectItem value="done">{t("done")}</SelectItem>
                </SelectContent>
              </Select>

              {totalTasks > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("progress", {
                    done: String(doneTasks),
                    total: String(totalTasks),
                  })}
                </span>
              )}
            </div>

            {/* Progress bar */}
            {totalTasks > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {pct}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {epic.description && (
          <div className="mt-3">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setDescExpanded((v) => !v)}
            >
              {descExpanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {t("description")}
            </button>
            {descExpanded && (
              <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap">
                {epic.description}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Task groups */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {STATUS_GROUPS.map((group) => (
          <StatusGroup
            key={group.status}
            label={
              group.status === "todo"
                ? t("todo")
                : group.status === "in_progress"
                  ? t("inProgress")
                  : t("done")
            }
            tasks={tasks.filter((task) => task.status === group.status)}
            epicId={epicId}
            onDelete={handleDelete}
            onTaskClick={handleTaskClick}
            onAdded={refresh}
            showAdd={group.status === "todo"}
          />
        ))}
      </div>

      {/* Task detail sheet */}
      <TaskSheet
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        epicId={epicId}
      />
    </div>
  );
}
