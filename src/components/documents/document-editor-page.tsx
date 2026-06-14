"use client";

import {
  deleteDocumentAction,
  getDocumentAction,
  setDocumentVisibilityAction,
  updateDocumentAction,
} from "@/app/api/documents/actions";
import type { Editor } from "@tiptap/react";
import type { DocumentEntity } from "lib/db/pg/repositories/document-repository.pg";
import { notify } from "lib/notify";
import type { Visibility } from "lib/visibility";
import { cn } from "lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Globe,
  History,
  Loader2,
  Lock,
  MessageSquare,
  Trash2,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { PresenceAvatars } from "../realtime/presence-avatars";
import { VisibilityField } from "../visibility/visibility-field";
import { DocumentComments } from "./document-comments";
import { DocumentEditor } from "./document-editor";
import { DocumentHistory } from "./document-history";
import { DocumentLive } from "./document-live";
import { AUTOSAVE_DEBOUNCE_MS, decideNearLive, isDirty } from "./document-sync";

/**
 * Editor surface for a single document. Owns:
 *   - inline-editable title + the rich-text editor (ProseMirror JSON);
 *   - debounced autosave (~1s) with a save-status pill, flushing on unmount /
 *     blur so navigation never drops edits;
 *   - the page-scoped near-live subscriber (the ONLY Electric connection in the
 *     documents feature) → silent refetch when clean+idle, reload banner when
 *     dirty/focused (decideNearLive, last-write-wins but non-destructive);
 *   - presence ("X editing / N viewing" via the shared presence island);
 *   - the History + Comments side panels and a delete action.
 *
 * Network-idle-safety: DocumentLive + PresenceAvatars mount HERE only, so the
 * sidebar and the /documents list hold no open connection. Comments poll only
 * while their panel is open.
 */

type SaveStatus = "idle" | "saving" | "saved" | "error";
type SidePanel = "none" | "comments" | "history";

const VISIBILITY_META: Record<Visibility, { icon: typeof Lock; key: string }> =
  {
    private: { icon: Lock, key: "Visibility.private" },
    shared: { icon: Users, key: "Visibility.shared" },
    team: { icon: Users, key: "Visibility.team" },
    company: { icon: Globe, key: "Visibility.company" },
  };

export function DocumentEditorPage({
  document: initialDoc,
  selfUserId,
  canEdit,
}: {
  document: DocumentEntity;
  selfUserId: string;
  canEdit: boolean;
}) {
  const t = useTranslations("Documents");
  const tRoot = useTranslations();
  const router = useRouter();

  const [title, setTitle] = useState(initialDoc.title);
  const [visibility, setVisibility] = useState<Visibility>(
    initialDoc.visibility as Visibility,
  );
  const [teamId, setTeamId] = useState<string | null>(initialDoc.teamId);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [panel, setPanel] = useState<SidePanel>("none");
  const [remoteBanner, setRemoteBanner] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  // Latest editor JSON + the last-confirmed-saved snapshot, for dirty checks.
  const contentRef = useRef<Record<string, unknown>>(initialDoc.content);
  const savedRef = useRef<{ title: string; content: Record<string, unknown> }>({
    title: initialDoc.title,
    content: initialDoc.content,
  });
  const focusedRef = useRef(false);
  const lastEditAtRef = useRef(0);
  const lastSaveAtRef = useRef(0);
  const appliedAtRef = useRef<number | null>(
    initialDoc.lastEditedAt
      ? new Date(initialDoc.lastEditedAt).getTime()
      : null,
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  // ── autosave ───────────────────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    if (!canEdit) return;
    const current = { title, content: contentRef.current };
    if (!isDirty(current, savedRef.current)) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    const result = await updateDocumentAction(initialDoc.id, {
      title: current.title,
      content: current.content,
    });
    savingRef.current = false;
    if (!result.success) {
      setStatus("error");
      toast.error(result.error);
      return;
    }
    savedRef.current = { title: current.title, content: current.content };
    lastSaveAtRef.current = Date.now();
    appliedAtRef.current = result.data.lastEditedAt
      ? new Date(result.data.lastEditedAt).getTime()
      : Date.now();
    setStatus("saved");
  }, [canEdit, initialDoc.id, title]);

  const queueSave = useCallback(() => {
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [canEdit, flushSave]);

  const handleEditorUpdate = useCallback(
    (json: Record<string, unknown>) => {
      contentRef.current = json;
      lastEditAtRef.current = Date.now();
      queueSave();
    },
    [queueSave],
  );

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      lastEditAtRef.current = Date.now();
      queueSave();
    },
    [queueSave],
  );

  // Flush on unmount + on tab hide (never lose edits on navigation).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flushSave();
    };
  }, [flushSave]);

  // ── near-live ────────────────────────────────────────────────────────────
  const reloadFromServer = useCallback(async () => {
    const result = await getDocumentAction(initialDoc.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const fresh = result.data;
    contentRef.current = fresh.content;
    savedRef.current = { title: fresh.title, content: fresh.content };
    appliedAtRef.current = fresh.lastEditedAt
      ? new Date(fresh.lastEditedAt).getTime()
      : Date.now();
    setTitle(fresh.title);
    setVisibility(fresh.visibility as Visibility);
    setTeamId(fresh.teamId);
    editorRef.current?.commands.setContent(fresh.content);
    setRemoteBanner(false);
    setStatus("saved");
  }, [initialDoc.id]);

  const handleSignal = useCallback(
    (change: {
      lastEditedBy: string | null;
      lastEditedAtMs: number | null;
    }) => {
      const now = Date.now();
      const current = { title, content: contentRef.current };
      const decision = decideNearLive(change, {
        selfUserId,
        editorDirty: isDirty(current, savedRef.current),
        editorFocused: focusedRef.current,
        msSinceLastEdit: now - lastEditAtRef.current,
        msSinceLastSave:
          lastSaveAtRef.current === 0 ? Infinity : now - lastSaveAtRef.current,
        appliedAtMs: appliedAtRef.current,
      });
      if (decision.action === "refetch") {
        void reloadFromServer();
      } else if (decision.action === "banner") {
        setRemoteBanner(true);
      }
      // "ignore" → no-op.
    },
    [reloadFromServer, selfUserId, title],
  );

  // ── visibility save ──────────────────────────────────────────────────────
  const handleVisibilityChange = useCallback(
    async (next: { visibility: Visibility; teamIds: string[] }) => {
      const prevVis = visibility;
      const prevTeam = teamId;
      setVisibility(next.visibility);
      const nextTeam =
        next.visibility === "team" ? (next.teamIds[0] ?? null) : null;
      setTeamId(nextTeam);
      const result = await setDocumentVisibilityAction(
        initialDoc.id,
        next.visibility,
        nextTeam,
      );
      if (!result.success) {
        setVisibility(prevVis);
        setTeamId(prevTeam);
        toast.error(result.error);
      }
    },
    [initialDoc.id, teamId, visibility],
  );

  const handleDelete = useCallback(async () => {
    const ok = await notify.confirm({
      title: t("deleteTitle"),
      description: t("deleteDescription"),
    });
    if (!ok) return;
    const result = await deleteDocumentAction(initialDoc.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(t("deleted"));
    router.push("/documents");
  }, [initialDoc.id, router, t]);

  const VisibilityIcon = VISIBILITY_META[visibility].icon;

  const statusLabel = useMemo(() => {
    switch (status) {
      case "saving":
        return t("saving");
      case "saved":
        return t("saved");
      case "error":
        return t("saveError");
      default:
        return "";
    }
  }, [status, t]);

  return (
    <div className="flex h-full flex-col">
      {/* Page-scoped near-live subscriber — the ONLY Electric connection in
          the documents feature. Tears down on unmount. */}
      <DocumentLive documentId={initialDoc.id} onSignal={handleSignal} />

      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="size-8">
              <Link href="/documents" aria-label={t("backToList")}>
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("backToList")}</TooltipContent>
        </Tooltip>

        <div
          className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground"
          data-testid="document-save-status"
        >
          {status === "saving" && <Loader2 className="size-3 animate-spin" />}
          {status === "saved" && <Check className="size-3 text-primary" />}
          {status === "error" && (
            <AlertCircle className="size-3 text-destructive" />
          )}
          <span className={cn(status === "error" && "text-destructive")}>
            {statusLabel}
          </span>
        </div>

        <PresenceAvatars
          contextType="document"
          contextId={initialDoc.id}
          selfUserId={selfUserId}
        />

        {/* Visibility */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              disabled={!canEdit}
              data-testid="document-visibility-trigger"
            >
              <VisibilityIcon className="size-3.5" />
              {tRoot(VISIBILITY_META[visibility].key)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <VisibilityField
              value={{
                visibility,
                teamIds: teamId ? [teamId] : [],
              }}
              onChange={handleVisibilityChange}
              entity={{ type: "document", id: initialDoc.id }}
              disabled={!canEdit}
            />
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={panel === "history" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              aria-label={t("history.title")}
              onClick={() =>
                setPanel((p) => (p === "history" ? "none" : "history"))
              }
              data-testid="document-history-toggle"
            >
              <History className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("history.title")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={panel === "comments" ? "secondary" : "ghost"}
              size="icon"
              className="size-8"
              aria-label={t("comments.title")}
              onClick={() =>
                setPanel((p) => (p === "comments" ? "none" : "comments"))
              }
              data-testid="document-comments-toggle"
            >
              <MessageSquare className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("comments.title")}</TooltipContent>
        </Tooltip>

        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={t("delete")}
                onClick={handleDelete}
                data-testid="document-delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("delete")}</TooltipContent>
          </Tooltip>
        )}
      </header>

      {/* Body: editor + optional side panel */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 py-8">
            {remoteBanner && (
              <button
                type="button"
                onClick={reloadFromServer}
                data-testid="document-remote-banner"
                className="mb-4 flex w-full items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-primary/10"
              >
                <AlertCircle className="size-4 shrink-0 text-primary" />
                <span className="flex-1">{t("remoteUpdated")}</span>
                <span className="text-xs font-medium text-primary">
                  {t("reload")}
                </span>
              </button>
            )}

            <input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={() => void flushSave()}
              disabled={!canEdit}
              placeholder={t("untitled")}
              data-testid="document-title-input"
              className="mb-4 w-full border-none bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground/50 disabled:cursor-default"
            />

            <DocumentEditor
              initialContent={initialDoc.content}
              editable={canEdit}
              editorRef={(e) => {
                editorRef.current = e;
              }}
              onUpdate={handleEditorUpdate}
              onFocus={() => {
                focusedRef.current = true;
              }}
              onBlur={() => {
                focusedRef.current = false;
                void flushSave();
              }}
            />
          </div>
        </div>

        {panel === "comments" && (
          <DocumentComments
            documentId={initialDoc.id}
            open
            onClose={() => setPanel("none")}
          />
        )}
        {panel === "history" && (
          <DocumentHistory
            documentId={initialDoc.id}
            open
            onClose={() => setPanel("none")}
            onRestored={(doc) => {
              contentRef.current = doc.content;
              savedRef.current = { title: doc.title, content: doc.content };
              setTitle(doc.title);
              editorRef.current?.commands.setContent(doc.content);
              appliedAtRef.current = doc.lastEditedAt
                ? new Date(doc.lastEditedAt).getTime()
                : Date.now();
            }}
          />
        )}
      </div>
    </div>
  );
}
