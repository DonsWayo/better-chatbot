"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import {
  type RoutineCostEstimate,
  createScheduleAction,
  estimateRoutineCostAction,
} from "@/app/api/agent-platform/schedule-actions";
import { CostPreview } from "@/components/runs/cost-preview";
import type { WorkflowSummary } from "app-types/workflow";
import { fetcher } from "lib/utils";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Switch } from "ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

// Agent Platform #26 — "/schedule" command: a calendar-clock button in the
// chat input toolbar that schedules a published workflow as a routine
// (workflow_schedule). Custom cron is validated by attempting the server
// action — scheduler.createSchedule throws CronError with a precise message
// which is surfaced inline.

const CRON_PRESETS = [
  { id: "hourly", labelKey: "presetHourly", cron: "0 * * * *" },
  { id: "daily", labelKey: "presetDaily", cron: "0 9 * * *" },
  { id: "weekly", labelKey: "presetWeekly", cron: "0 9 * * 1" },
  { id: "monthly", labelKey: "presetMonthly", cron: "0 9 1 * *" },
  { id: "custom", labelKey: "presetCustom", cron: null },
] as const;

type PresetId = (typeof CRON_PRESETS)[number]["id"];

const TIMEZONES = [
  "Europe/London",
  "UTC",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Oslo",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
];

export function ScheduleRoutineDialog() {
  const t = useTranslations("Triage");
  const tRuns = useTranslations("Runs");

  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [preset, setPreset] = useState<PresetId>("daily");
  const [customCron, setCustomCron] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<RoutineCostEstimate | null>(null);

  const { data: workflows } = useSWR<WorkflowSummary[]>(
    open ? "/api/workflow" : null,
    fetcher,
  );
  const published = useMemo(
    () => (workflows ?? []).filter((w) => w.isPublished),
    [workflows],
  );

  // Static per-run estimate + which budget pays — fetched once per open.
  useEffect(() => {
    if (!open) return;
    estimateRoutineCostAction()
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [open]);

  const cronExpr =
    preset === "custom"
      ? customCron.trim()
      : (CRON_PRESETS.find((p) => p.id === preset)?.cron ?? "");

  const canSubmit = Boolean(workflowId && cronExpr) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setCronError(null);
    try {
      await createScheduleAction({ workflowId, cronExpr, timezone, enabled });
      toast.success(t("routineCreated"));
      setOpen(false);
      setWorkflowId("");
      setPreset("daily");
      setCustomCron("");
    } catch (error) {
      // CronError (invalid expression/timezone) and friends land here —
      // shown inline so the user can fix the custom cron and retry.
      setCronError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full hover:bg-input! p-2!"
              data-testid="schedule-routine-button"
            >
              <CalendarClock className="size-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("scheduleRoutineTitle")}</TooltipContent>
      </Tooltip>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scheduleRoutineTitle")}</DialogTitle>
          <DialogDescription>
            {t("scheduleRoutineDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-2">
            <Label>{t("workflow")}</Label>
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t("workflowPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {published.map((workflow) => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {workflows && published.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("noPublishedWorkflows")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("cadence")}</Label>
            <Select
              value={preset}
              onValueChange={(value) => setPreset(value as PresetId)}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {t(p.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <Input
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                placeholder={t("customCronPlaceholder")}
                className="rounded-xl font-mono text-sm"
                data-testid="schedule-custom-cron"
              />
            )}
            {cronError && (
              <p className="text-xs text-destructive" role="alert">
                {cronError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("timezone")}</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="schedule-enabled">{t("enabled")}</Label>
            <Switch
              id="schedule-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <CostPreview
            estimatedUsd={estimate?.estimatedUsd}
            budgetLabel={estimate?.budgetLabel ?? tRuns("personalBudget")}
            className="self-start"
          />
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Link
            href="/inbox"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setOpen(false)}
          >
            {t("routinesTab")} →
          </Link>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-full bg-[#FFC72C] text-black hover:bg-[#FFC72C]/80"
            data-testid="schedule-submit"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {t("createRoutine")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
