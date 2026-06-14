"use client";

import {
  createDocumentCommentAction,
  deleteDocumentCommentAction,
  listDocumentCommentsAction,
} from "@/app/api/documents/actions";
import { authClient } from "auth/client";
import { formatDistanceToNow } from "date-fns";
import type { DocumentCommentWithUser } from "lib/db/pg/repositories/document-comment-repository.pg";
import { notify } from "lib/notify";
import type { TipTapMentionJsonContent } from "app-types/util";
import { CornerDownRightIcon, LoaderIcon, SendIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";
import MentionInput from "../mention-input";
import { countComments, mergeComments } from "./comments-merge";

/**
 * Comments panel for a collaborative document. Realtime is POLLING: while the
 * panel is OPEN and the tab is VISIBLE, SWR re-fetches every 4s. When the panel
 * is closed the SWR key is null, so a closed panel holds NO connection and a
 * normal page load reaches network-idle. This mirrors the export comments
 * drawer (src/components/export/comments.tsx) but talks to the document comment
 * Server Actions instead of a public REST route.
 */

const COMMENTS_POLL_INTERVAL_MS = 4000;

async function fetchComments(
  documentId: string,
): Promise<DocumentCommentWithUser[]> {
  const result = await listDocumentCommentsAction(documentId);
  if (!result.success) throw new Error(result.error);
  return result.data;
}

export function DocumentComments({
  documentId,
  open,
  onClose,
}: {
  documentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Documents");
  const { data: session } = authClient.useSession();
  const selfId = session?.user?.id;

  const [optimistic, setOptimistic] = useState<
    Array<{ comment: DocumentCommentWithUser; version: number }>
  >([]);
  const [replyTo, setReplyTo] = useState<DocumentCommentWithUser | null>(null);

  const { data, isLoading, mutate } = useSWR(
    open ? ["document-comments", documentId] : null,
    () => fetchComments(documentId),
    {
      // Active polling ONLY while the panel is open. Closed → key is null → no
      // request, no held timer; network goes idle (Playwright-safe).
      refreshInterval: open ? COMMENTS_POLL_INTERVAL_MS : 0,
      revalidateOnFocus: false,
    },
  );

  // Retire optimistic comments once a strictly newer server response lands.
  const versionRef = useRef(0);
  useEffect(() => {
    versionRef.current += 1;
    const version = versionRef.current;
    setOptimistic((prev) => {
      const still = prev.filter((o) => o.version >= version);
      return still.length === prev.length ? prev : still;
    });
  }, [data]);

  const pendingOptimistic = useMemo(
    () => optimistic.map((o) => o.comment),
    [optimistic],
  );
  const comments = useMemo(
    () => mergeComments(data, pendingOptimistic),
    [data, pendingOptimistic],
  );
  const total = useMemo(() => countComments(comments), [comments]);

  const handleCreate = useCallback(
    async (content: TipTapMentionJsonContent, parentId?: string) => {
      const result = await createDocumentCommentAction({
        documentId,
        content: content as Record<string, unknown>,
        parentId: parentId ?? null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOptimistic((prev) => [
        ...prev,
        { comment: result.data, version: versionRef.current },
      ]);
      setReplyTo(null);
      await mutate();
    },
    [documentId, mutate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await notify.confirm({
        title: t("comments.deleteTitle"),
        description: t("comments.deleteDescription"),
      });
      if (!ok) return;
      const result = await deleteDocumentCommentAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await mutate();
    },
    [mutate, t],
  );

  if (!open) return null;

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-border bg-background lg:w-80"
      data-testid="document-comments-panel"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          {t("comments.title")}
          {total > 0 && (
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
              {total}
            </span>
          )}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t("comments.close")}
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading && !data ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : comments.length === 0 ? (
          <p
            className="py-8 text-center text-sm text-muted-foreground"
            data-testid="document-comments-empty"
          >
            {t("comments.empty")}
          </p>
        ) : (
          comments.map((comment) => (
            <DocumentComment
              key={comment.id}
              comment={comment}
              onReply={() => setReplyTo(comment)}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-3">
        {replyTo && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CornerDownRightIcon className="size-3" />
            {t("comments.replyingTo", { name: replyTo.authorName })}
            <XIcon
              className="ml-auto size-3 cursor-pointer hover:text-foreground"
              onClick={() => setReplyTo(null)}
            />
          </div>
        )}
        <DocumentCommentForm
          disabled={!selfId}
          onSubmit={(content) => handleCreate(content, replyTo?.id)}
        />
      </div>
    </aside>
  );
}

function DocumentComment({
  comment,
  depth = 0,
  onReply,
  onDelete,
}: {
  comment: DocumentCommentWithUser;
  depth?: number;
  onReply?: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("Documents");
  return (
    <div className="flex items-start gap-3">
      <Avatar className="size-6 rounded-full">
        <AvatarImage src={comment.authorImage} />
        <AvatarFallback>
          {comment.authorName?.[0]?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-medium">{comment.authorName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), {
              addSuffix: true,
            })}
          </span>
        </div>
        <div className="text-sm">
          <MentionInput
            content={comment.content as TipTapMentionJsonContent}
            disabled
            className="p-0"
          />
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          {depth < 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReply}
              className="h-auto p-0! text-xs! hover:bg-transparent!"
            >
              <CornerDownRightIcon className="size-3" />
              {t("comments.reply")}
            </Button>
          )}
          {comment.isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(comment.id)}
              className="h-auto p-0! text-xs! hover:bg-transparent! hover:text-destructive"
            >
              {t("comments.delete")}
            </Button>
          )}
        </div>
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2 border-l border-border/40 pl-3">
            {comment.replies.map((reply) => (
              <DocumentComment
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentCommentForm({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (content: TipTapMentionJsonContent) => Promise<void>;
}) {
  const t = useTranslations("Documents");
  const [content, setContent] = useState<
    TipTapMentionJsonContent | string | undefined
  >();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content || typeof content === "string") return;
    const trimmed = content.content?.filter(
      (item) => !(item.type === "paragraph" && !item.content),
    );
    if (!trimmed || trimmed.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmit({ ...content, content: trimmed });
      setContent("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex w-full items-end gap-2"
      data-testid="document-comment-form"
    >
      <div className="flex-1 rounded-lg bg-secondary p-0.5">
        <MentionInput
          className="text-sm"
          placeholder={t("comments.placeholder")}
          content={content}
          disabled={disabled}
          disabledMention
          onChange={({ json }) => setContent(json)}
          onEnter={submit}
        />
      </div>
      <Button
        size="icon"
        variant="ghost"
        disabled={disabled || submitting || !content}
        onClick={submit}
        data-testid="document-comment-submit"
        aria-label={t("comments.send")}
      >
        {submitting ? <LoaderIcon className="animate-spin" /> : <SendIcon />}
      </Button>
    </div>
  );
}
