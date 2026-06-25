"use client";

import {
  createEpicAction,
  deleteEpicAction,
  listEpicsAction,
  updateEpicAction,
} from "@/app/api/tasks/actions";
import type { EpicSummary } from "lib/db/pg/repositories/epic-repository.pg";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LayoutList,
  MoreHorizontal,
  Plus,
  Trash,
} from "lucide-react";
import { notify } from "lib/notify";
import { cn } from "lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { EmptyState } from "ui/empty-state";
import { Input } from "ui/input";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";

const SWR_KEY = "tasks-epics";

type EpicStatus = "backlog" | "in_progress" | "done";

const COLUMNS: { status: EpicStatus; labelKey: string }[] = [
  { status: "backlog", labelKey: "backlog" },
  { status: "in_progress", labelKey: "inProgress" },
  { status: "done", labelKey: "done" },
];

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const STATUS_ICON: Record<EpicStatus, React.ElementType> = {
  backlog: Clock,
  in_progress: AlertCircle,
  done: CheckCircle2,
};

// ---------------------------------------------------------------------------
// New-epic modal
// ---------------------------------------------------------------------------

function NewEpicModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Tasks");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "private" | "shared" | "team" | "company"
  >("team");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const result = await createEpicAction({
      title,
      description: description || null,
      visibility,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setTitle("");
    setDescription("");
    onOpenChange(false);
    onCreated();
    toast.success(t("epicCreated"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("newEpic")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="epic-title">{t("title")}</Label>
            <Input
              id="epic-title"
              placeholder={t("epicTitlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="epic-desc">{t("description")}</Label>
            <Textarea
              id="epic-desc"
              placeholder={t("epicDescPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="epic-vis">{t("visibility")}</Label>
            <Select
              value={visibility}
              onValueChange={(v) =>
                setVisibility(
                  v as "private" | "shared" | "team" | "company",
                )
              }
            >
              <SelectTrigger id="epic-vis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Creating…" : t("newEpic")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Epic card
// ---------------------------------------------------------------------------

function EpicCard({
  epic,
  onDelete,
  onStatusChange,
}: {
  epic: EpicSummary;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: EpicStatus) => void;
}) {
  const t = useTranslations("Tasks");
  const pct =
    epic.taskTotal > 0
      ? Math.round((epic.taskDone / epic.taskTotal) * 100)
      : 0;

  return (
    <div className="group relative rounded-xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <Link
          href={`/tasks/${epic.id}`}
          className="font-medium text-sm leading-snug hover:underline line-clamp-2 flex-1"
        >
          {epic.title}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Epic actions"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(["backlog", "in_progress", "done"] as EpicStatus[])
              .filter((s) => s !== epic.status)
              .map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onStatusChange(epic.id, s)}
                >
                  {t(s === "in_progress" ? "inProgress" : s === "done" ? "done" : "backlog")}
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(epic.id)}
            >
              <Trash className="size-3.5 mr-1" />
              {t("deleteEpic")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Labels */}
      {epic.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {epic.labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {epic.taskTotal > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>
              {t("progress", {
                done: String(epic.taskDone),
                total: String(epic.taskTotal),
              })}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer: priority + owner avatar */}
      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0 border-0", PRIORITY_COLOR[epic.priority])}
        >
          {t(epic.priority)}
        </Badge>
        {epic.ownerName && (
          <Avatar className="h-5 w-5">
            <AvatarImage src={epic.ownerImage ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {epic.ownerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main board
// ---------------------------------------------------------------------------

export function EpicsBoard({ initialEpics }: { initialEpics: EpicSummary[] }) {
  const t = useTranslations("Tasks");
  const [newEpicOpen, setNewEpicOpen] = useState(false);

  const { data: epics = initialEpics, isLoading } = useSWR<EpicSummary[]>(
    SWR_KEY,
    async () => {
      const result = await listEpicsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    { fallbackData: initialEpics, revalidateOnFocus: false },
  );

  const handleDelete = async (id: string) => {
    const ok = await notify.confirm({
      description: t("deleteEpicConfirm"),
    });
    if (!ok) return;
    const result = await deleteEpicAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(SWR_KEY);
  };

  const handleStatusChange = async (id: string, status: EpicStatus) => {
    const result = await updateEpicAction(id, { status });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    mutate(SWR_KEY);
  };

  const byStatus = (status: EpicStatus) =>
    epics.filter((e) => e.status === status);

  const totalEpics = epics.length;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <LayoutList className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("epics")}</h1>
          {totalEpics > 0 && (
            <span className="text-xs text-muted-foreground">{totalEpics}</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setNewEpicOpen(true)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          {t("newEpic")}
        </Button>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COLUMNS.map((col) => (
              <div key={col.status} className="space-y-3">
                <Skeleton className="h-5 w-24" />
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </div>
        ) : totalEpics === 0 ? (
          <EmptyState
            title={t("noEpics")}
            description={t("noEpicsDescription")}
            action={
              <Button onClick={() => setNewEpicOpen(true)} className="gap-1.5">
                <Plus className="size-3.5" />
                {t("newEpic")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COLUMNS.map((col) => {
              const Icon = STATUS_ICON[col.status];
              const items = byStatus(col.status);
              return (
                <div key={col.status} className="flex flex-col gap-3">
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {col.status === "backlog"
                        ? t("backlog")
                        : col.status === "in_progress"
                          ? t("inProgress")
                          : t("done")}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {String(items.length)}
                    </span>
                  </div>
                  {/* Cards */}
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/40 p-6 text-center">
                      <p className="text-xs text-muted-foreground">
                        {t("noEpics")}
                      </p>
                    </div>
                  ) : (
                    items.map((epic) => (
                      <EpicCard
                        key={epic.id}
                        epic={epic}
                        onDelete={handleDelete}
                        onStatusChange={handleStatusChange}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NewEpicModal
        open={newEpicOpen}
        onOpenChange={setNewEpicOpen}
        onCreated={() => mutate(SWR_KEY)}
      />
    </div>
  );
}
