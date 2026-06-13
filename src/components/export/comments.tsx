"use client";

import { ChatExportCommentWithUser } from "app-types/chat-export";
import { authClient } from "auth/client";
import { notify } from "lib/notify";
import { fetcher, truncateString } from "lib/utils";
import { CornerDownRightIcon, MessagesSquareIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Button } from "ui/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "ui/drawer";
import { Skeleton } from "ui/skeleton";
import Comment from "./comment";
import CommentForm from "./comment-form";
import { countComments, mergeComments } from "./comments-merge";

/**
 * How often the comments drawer re-polls the server while it is OPEN and the
 * tab is VISIBLE. Realtime here is polling, not a held-open connection: the
 * export page is PUBLIC so the authenticated Electric shape proxy can't serve
 * anonymous viewers, and an interval poll is network-idle-safe (the network
 * goes quiet between polls, so Playwright `networkidle` still settles).
 * See content/docs/collaboration/realtime.mdx#comments.
 */
const COMMENTS_POLL_INTERVAL_MS = 4000;

/** Treat the user as "near the bottom" within this many px (don't yank them). */
const NEAR_BOTTOM_THRESHOLD_PX = 80;

export default function Comments({
  id,
  children,
  defaultComments,
}: {
  id: string;
  children?: React.ReactNode;
  defaultComments: ChatExportCommentWithUser[];
}) {
  const { data: session, isPending } = authClient.useSession();

  const isLoggedIn = !!session?.user?.id;

  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<ChatExportCommentWithUser | null>(
    null,
  );
  // Local optimistic comments this user just posted, kept only until the next
  // server fetch lands (which, after the POST + mutate, already includes the
  // real row). Each entry remembers the data-version it was inserted at; once a
  // newer fetch resolves we retire it and let the server copy win. This guards
  // against a poll that fires mid-POST dropping the user's own comment.
  const [optimistic, setOptimistic] = useState<
    Array<{ comment: ChatExportCommentWithUser; insertedAtVersion: number }>
  >([]);
  // Subtle "new comments" affordance when others' comments land while the user
  // is scrolled up reading older ones.
  const [hasNewWhileScrolledUp, setHasNewWhileScrolledUp] = useState(false);

  const router = useRouter();

  // Poll only while the drawer is open AND the tab is visible. SWR's
  // refreshInterval accepts a callback evaluated against the latest data, but
  // visibility can change without new data, so we also gate via refreshWhenHidden
  // (left default = false) and an explicit visibility check below.
  const key = isLoggedIn ? `/api/export/${id}/comments` : null;
  const { data, isLoading } = useSWR<ChatExportCommentWithUser[]>(
    key,
    fetcher,
    {
      fallbackData: defaultComments,
      revalidateOnMount: false,
      // Active polling ONLY while the drawer is open. When closed (the default
      // state of a freshly-loaded export page) this returns 0, so a normal load
      // reaches network-idle and never opens a long-lived request.
      refreshInterval: () => (open ? COMMENTS_POLL_INTERVAL_MS : 0),
      // SWR pauses refreshInterval automatically while the tab is hidden
      // (refreshWhenHidden defaults to false) — no held timer fires in the
      // background, saving resources and keeping things network-idle-safe.
    },
  );

  // Monotonic version that bumps every time a fresh server response lands.
  // Optimistic inserts are stamped with the current version and retired once a
  // strictly newer response arrives (which, post-POST, already has the row).
  const dataVersionRef = useRef(0);
  useEffect(() => {
    dataVersionRef.current += 1;
    const version = dataVersionRef.current;
    setOptimistic((prev) => {
      const stillPending = prev.filter((o) => o.insertedAtVersion >= version);
      return stillPending.length === prev.length ? prev : stillPending;
    });
  }, [data]);

  const pendingOptimistic = useMemo(
    () => optimistic.map((o) => o.comment),
    [optimistic],
  );

  // Merge server truth with still-pending local optimistic inserts so a poll
  // that beats the POST round-trip never drops the user's own comment, while
  // OTHER users' new comments / replies / deletions are reflected live.
  const comments = useMemo(
    () => mergeComments(data, pendingOptimistic),
    [data, pendingOptimistic],
  );

  const commentCount = useMemo(() => countComments(comments), [comments]);

  const trigger = useMemo(() => {
    if (children) return children;

    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        disabled={isPending}
        data-testid="comments-trigger"
      >
        <MessagesSquareIcon />
        {commentCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {commentCount}
          </span>
        )}
      </Button>
    );
  }, [children, commentCount, isPending]);

  // Track whether new comments arrived while the user was scrolled up, so we
  // can show a calm affordance instead of yanking them to the bottom.
  const prevCountRef = useRef(commentCount);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = commentCount;
    if (!open || commentCount <= prev) return;
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > NEAR_BOTTOM_THRESHOLD_PX) {
      // The user is reading older comments — don't move them, just hint.
      setHasNewWhileScrolledUp(true);
    } else {
      // Already near the bottom: keep them pinned to the newest comment.
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [commentCount, open]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setHasNewWhileScrolledUp(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!isLoggedIn) {
      notify
        .confirm({
          title: "Sign in required",
          description:
            "You need to sign in to view comments. Would you like to go to the sign-in page?",
        })
        .then((answer) => {
          if (answer) {
            router.push("/sign-in");
          }
        });
    } else {
      setOpen(next);
      if (next) {
        // Pull the latest immediately on open instead of waiting a full
        // interval, then let the poll take over.
        mutate(key);
      }
    }
  };

  const handleReplySubmit = async (created?: ChatExportCommentWithUser) => {
    setReplyTo(null);
    if (created) {
      // Stamp with the current data-version; the revalidation triggered below
      // bumps the version when it lands and retires this optimistic entry.
      setOptimistic((prev) => [
        ...prev,
        { comment: created, insertedAtVersion: dataVersionRef.current },
      ]);
    }
    await mutate(key);
    scrollToBottom();
  };

  return (
    <Drawer
      handleOnly
      direction="right"
      modal
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>

      <DrawerContent
        className="select-text! w-full lg:w-md border-none! bg-transparent! p-4"
        disableOverlay
      >
        <DrawerTitle className="sr-only">Comments</DrawerTitle>

        <div className="overflow-hidden w-full h-full flex flex-col bg-secondary/40 backdrop-blur-sm rounded-lg border">
          <div className="flex items-center justify-end p-2">
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <XIcon />
            </Button>
          </div>

          <div className="relative flex-1 min-h-0">
            <div
              className="h-full overflow-y-auto p-4 pt-0 space-y-4"
              ref={scrollRef}
              onScroll={() => {
                const el = scrollRef.current;
                if (!el) return;
                const distanceFromBottom =
                  el.scrollHeight - el.scrollTop - el.clientHeight;
                if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX) {
                  setHasNewWhileScrolledUp(false);
                }
              }}
            >
              {isLoading ? (
                <>
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </>
              ) : comments.length === 0 ? (
                <div
                  className="text-center py-8 h-full flex justify-center items-center"
                  data-testid="comments-empty"
                >
                  <p className="text-muted-foreground">
                    Be the first to comment!
                  </p>
                </div>
              ) : (
                comments.map((comment) => (
                  <Comment
                    key={comment.id}
                    comment={comment}
                    exportId={id}
                    maxReplyDepth={1}
                    onReply={() => setReplyTo(comment)}
                  />
                ))
              )}
            </div>

            {hasNewWhileScrolledUp && (
              <button
                type="button"
                onClick={() => scrollToBottom()}
                data-testid="comments-new-affordance"
                className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs px-3 py-1 shadow-md hover:opacity-90 transition-opacity"
              >
                New comments
              </button>
            )}
          </div>

          <div className="border-t border-border  p-4 bg-background flex flex-col gap-2">
            {replyTo && (
              <div className="flex items-center text-xs text-muted-foreground gap-1">
                <CornerDownRightIcon className="size-3" />
                <Avatar className="size-3 rounded-full">
                  <AvatarImage src={replyTo.authorImage} />
                  <AvatarFallback>
                    {replyTo.authorName?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                Replying to
                <span className="text-primary">
                  {truncateString(replyTo.authorName, 8)}
                </span>{" "}
                <XIcon
                  className="ml-auto size-2.5 cursor-pointer hover:text-primary"
                  onClick={() => setReplyTo(null)}
                />
              </div>
            )}
            <CommentForm
              exportId={id}
              parentId={replyTo?.id}
              authorId={session?.user?.id}
              authorName={session?.user?.name}
              authorImage={session?.user?.image ?? undefined}
              onSubmit={handleReplySubmit}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
