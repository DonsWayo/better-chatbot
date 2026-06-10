"use client";

import { format } from "date-fns";
import { Trash2, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteScheduleAction,
  toggleScheduleAction,
} from "@/app/api/agent-platform/schedule-actions";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { handleErrorWithToast } from "ui/shared-toast";
import { Switch } from "ui/switch";

// Agent Platform #26 — Triage "Routines" tab: the caller's workflow
// schedules with enable/disable + delete. Plain serializable shape so the
// drizzle schema never enters the client bundle (dates as ISO strings).

export interface RoutineItem {
  id: string;
  workflowId: string;
  workflowName: string | null;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

function formatRunAt(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, HH:mm");
}

export function RoutinesList({ routines }: { routines: RoutineItem[] }) {
  const t = useTranslations("Triage");
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic local overrides keyed by schedule id.
  const [enabledOverride, setEnabledOverride] = useState<
    Record<string, boolean>
  >({});
  const [deleted, setDeleted] = useState<Record<string, boolean>>({});

  const visible = routines.filter((r) => !deleted[r.id]);

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {t("emptyRoutines")}
      </div>
    );
  }

  const toggle = (id: string, enabled: boolean) => {
    setEnabledOverride((prev) => ({ ...prev, [id]: enabled }));
    startTransition(async () => {
      try {
        await toggleScheduleAction(id, enabled);
        router.refresh();
      } catch (error) {
        setEnabledOverride((prev) => ({ ...prev, [id]: !enabled }));
        handleErrorWithToast(error as Error);
      }
    });
  };

  const remove = (id: string) => {
    setDeleted((prev) => ({ ...prev, [id]: true }));
    startTransition(async () => {
      try {
        await deleteScheduleAction(id);
        toast.success(t("routineDeleted"));
        router.refresh();
      } catch (error) {
        setDeleted((prev) => ({ ...prev, [id]: false }));
        handleErrorWithToast(error as Error);
      }
    });
  };

  return (
    <ul className="flex flex-col gap-3" data-testid="routines-list">
      {visible.map((routine) => {
        const enabled = enabledOverride[routine.id] ?? routine.enabled;
        return (
          <li
            key={routine.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs"
          >
            <Workflow className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {routine.workflowName ?? routine.workflowId}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <code className="font-mono">{routine.cronExpr}</code>
                <span>{routine.timezone}</span>
                <span>
                  {t("nextRun")}: {formatRunAt(routine.nextRunAt)}
                </span>
                <span>
                  {t("lastRun")}: {formatRunAt(routine.lastRunAt)}
                </span>
              </p>
            </div>
            {enabled && (
              <Badge className="rounded-full border-transparent bg-[#FFC72C]/15 text-[#9a7b00] dark:text-[#FFC72C]">
                {t("enabled")}
              </Badge>
            )}
            <Switch
              checked={enabled}
              onCheckedChange={(next) => toggle(routine.id, next)}
              aria-label={t("enabled")}
              data-testid="routine-toggle"
            />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-destructive"
              title={t("deleteRoutine")}
              aria-label={t("deleteRoutine")}
              onClick={() => remove(routine.id)}
              data-testid="routine-delete"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
