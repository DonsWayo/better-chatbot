"use client";

import {
  listDocumentVersionsAction,
  restoreDocumentVersionAction,
  saveDocumentVersionAction,
} from "@/app/api/documents/actions";
import { formatDistanceToNow } from "date-fns";
import type { DocumentEntity } from "lib/db/pg/repositories/document-repository.pg";
import { notify } from "lib/notify";
import { History, LoaderIcon, RotateCcw, Save, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";

/**
 * Version-history panel for a document. Lists revisions (newest first), lets the
 * editor snapshot the current state ("Save version") and restore a past one
 * (restore itself snapshots first, so it is undoable). No realtime — it fetches
 * once on open and after each save/restore, so it holds no connection.
 */

type Revision = {
  id: string;
  title: string;
  editedBy: string | null;
  createdAt: string | Date;
};

export function DocumentHistory({
  documentId,
  open,
  onClose,
  onRestored,
}: {
  documentId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the restored doc so the editor can swap content in place. */
  onRestored: (doc: DocumentEntity) => void;
}) {
  const t = useTranslations("Documents");
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listDocumentVersionsAction(documentId);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setRevisions(result.data as unknown as Revision[]);
  }, [documentId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const result = await saveDocumentVersionAction(documentId);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(t("history.saved"));
    void refresh();
  }, [documentId, refresh, t]);

  const handleRestore = useCallback(
    async (revisionId: string) => {
      const ok = await notify.confirm({
        title: t("history.restoreTitle"),
        description: t("history.restoreDescription"),
      });
      if (!ok) return;
      setRestoringId(revisionId);
      const result = await restoreDocumentVersionAction(documentId, revisionId);
      setRestoringId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onRestored(result.data);
      toast.success(t("history.restored"));
      void refresh();
    },
    [documentId, onRestored, refresh, t],
  );

  if (!open) return null;

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-border bg-background lg:w-80"
      data-testid="document-history-panel"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4" />
          {t("history.title")}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("history.close")}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="border-b border-border p-3">
        <Button
          variant="secondary"
          size="sm"
          className="w-full rounded-lg"
          disabled={saving}
          onClick={handleSave}
          data-testid="document-save-version"
        >
          {saving ? (
            <LoaderIcon className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {t("history.saveVersion")}
        </Button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {loading && !revisions ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : !revisions || revisions.length === 0 ? (
          <p
            className="py-8 text-center text-sm text-muted-foreground"
            data-testid="document-history-empty"
          >
            {t("history.empty")}
          </p>
        ) : (
          revisions.map((rev) => (
            <div
              key={rev.id}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-secondary/60"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rev.title}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(rev.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto gap-1 p-1 text-xs"
                disabled={restoringId === rev.id}
                onClick={() => handleRestore(rev.id)}
                data-testid="document-restore-version"
              >
                {restoringId === rev.id ? (
                  <LoaderIcon className="size-3 animate-spin" />
                ) : (
                  <RotateCcw className="size-3" />
                )}
                {t("history.restore")}
              </Button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
