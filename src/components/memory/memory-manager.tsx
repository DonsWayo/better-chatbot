"use client";

import {
  deleteAllMemoriesAction,
  deleteMemoryAction,
  setMemoryModeAction,
} from "@/app/api/memory/actions";
import { formatDistanceToNow } from "date-fns";
import { notify } from "lib/notify";
import { fetcher } from "lib/utils";
import { Loader, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { EmptyState } from "ui/empty-state";
import { Skeleton } from "ui/skeleton";

// Settings › Personalization › Memory — the transparency surface for user
// memory (docs/design/user-memory.md): tri-state on/paused/off, per-item
// view + delete, clear-all, org-policy note. Calm Industrial: one quiet list,
// no color washes; destructive paths always confirm.

type MemoryMode = "on" | "paused" | "off";

interface MemoryItem {
  id: string;
  kind: "preference" | "decision" | "profile" | "project_context";
  content: string;
  createdAt: string;
}

interface MemoryResponse {
  policy: { enabled: boolean; implicitExtraction: boolean };
  mode: MemoryMode;
  memories: MemoryItem[];
}

const KIND_LABEL_KEYS: Record<MemoryItem["kind"], string> = {
  preference: "kindPreference",
  decision: "kindDecision",
  profile: "kindProfile",
  project_context: "kindProjectContext",
};

const MODES: MemoryMode[] = ["on", "paused", "off"];

export function MemoryManager() {
  const t = useTranslations("Memory");
  const { data, mutate, isLoading } = useSWR<MemoryResponse>(
    "/api/memory",
    fetcher,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  const mode = data?.mode ?? "on";
  const policyEnabled = data?.policy.enabled ?? true;
  const memories = data?.memories ?? [];

  const handleModeChange = async (next: MemoryMode) => {
    if (next === mode || savingMode) return;
    if (next === "off") {
      const confirmed = await notify.confirm({
        description: t("confirmReset"),
      });
      if (!confirmed) return;
    }
    setSavingMode(true);
    try {
      await setMemoryModeAction(next);
      toast.success(t("modeSaved"));
      mutate();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSavingMode(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteMemoryAction(id);
      toast.success(t("memoryDeleted"));
      mutate();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAll = async () => {
    const confirmed = await notify.confirm({
      description: t("confirmClearAll"),
    });
    if (!confirmed) return;
    setBusyId("__all__");
    try {
      await deleteAllMemoriesAction();
      toast.success(t("memoriesCleared"));
      mutate();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">{t("title")}</h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("description")}
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : !policyEnabled ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">
          {t("policyDisabled")}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Tri-state mode control */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("modeLabel")}</span>
            <div className="flex items-center gap-1 rounded-full border p-1 w-fit">
              {MODES.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? "secondary" : "ghost"}
                  className="rounded-full px-4"
                  disabled={savingMode}
                  onClick={() => handleModeChange(m)}
                >
                  {t(
                    m === "on"
                      ? "modeOn"
                      : m === "paused"
                        ? "modePaused"
                        : "modeOff",
                  )}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "on"
                ? t("modeOnDescription")
                : mode === "paused"
                  ? t("modePausedDescription")
                  : t("modeOffDescription")}
            </p>
          </div>

          {/* Memory list */}
          {memories.length === 0 ? (
            <EmptyState
              compact
              title={t("emptyState")}
              description={t("explicitHint")}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full">
                        {t(KIND_LABEL_KEYS[memory.kind])}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(memory.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-sm mt-2 break-words">{memory.content}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busyId === memory.id}
                    onClick={() => handleDelete(memory.id)}
                    title={t("deleteMemory")}
                  >
                    {busyId === memory.id ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 hover:text-destructive" />
                    )}
                  </Button>
                </div>
              ))}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busyId === "__all__"}
                  onClick={handleClearAll}
                >
                  {busyId === "__all__" ? (
                    <Loader className="size-4 mr-2 animate-spin" />
                  ) : null}
                  {t("clearAll")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
