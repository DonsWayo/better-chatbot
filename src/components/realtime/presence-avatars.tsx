"use client";

import { useShape } from "@electric-sql/react";
import { heartbeatPresenceAction } from "lib/realtime/presence-actions";
import {
  PRESENCE_ACTIVE_WINDOW_MS,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  type PresenceContextType,
  SHAPE_PROXY_PATH,
  TYPING_DISPLAY_WINDOW_MS,
} from "lib/realtime/shapes";
import { cn, fetcher } from "lib/utils";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

/**
 * Presence island (Electric realtime phase 3 — see
 * content/docs/collaboration/realtime.mdx#presence).
 *
 * While mounted (only on shared contexts; the server decides that) it:
 *  1. heartbeats via the Server Action on mount and every 30s while the tab
 *     is visible — never while hidden;
 *  2. subscribes to the `asafe_presence` shape for this context through the
 *     authenticated proxy (the shape carries ids + timestamps only);
 *  3. renders a calm avatar stack of teammates active in the last 90s,
 *     excluding the viewer. Names/avatars resolve lazily via
 *     /api/realtime/presence-users.
 *
 * Design language (docs/design/ui-language.md): small overlapping rounded
 * avatars, 1px border, no loud colors — the yellow "alive" pulse stays
 * reserved for Runs.
 */

const MAX_VISIBLE_AVATARS = 5;
/** How often the "active in the last 90s" window re-evaluates client-side. */
const ACTIVITY_TICK_MS = 15_000;
/** Faster tick while someone is typing so the 10s window expires promptly. */
const TYPING_TICK_MS = 2_000;
/** "A and B are typing…" caps at two names; the rest fold into "+N others". */
const MAX_TYPING_NAMES = 2;

type PresenceRow = {
  id: string;
  user_id: string;
  context_type: string;
  context_id: string;
  last_seen_at: string;
  typing: boolean;
};

type PresenceUser = {
  id: string;
  name: string;
  image: string | null;
};

/**
 * asafe_presence.last_seen_at is a naive `timestamp` written with now() by
 * Postgres (UTC in every deployment target); Electric streams it without a
 * timezone suffix. Parse it as UTC so the activity window is not off by the
 * viewer's UTC offset.
 */
function parsePresenceTimestamp(value: string): number {
  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  return Date.parse(
    /[zZ]|[+-]\d{2}/.test(normalized.slice(10)) ? normalized : `${normalized}Z`,
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** "Ana is typing…" / "Ana and Ben are typing…" / "Ana, Ben +2 others are typing…" */
function typingLabel(names: string[]): string {
  const visible = names.slice(0, MAX_TYPING_NAMES);
  const overflow = names.length - visible.length;
  if (overflow > 0) {
    return `${visible.join(", ")} +${overflow} ${overflow === 1 ? "other" : "others"} are typing…`;
  }
  if (visible.length === 2) {
    return `${visible[0]} and ${visible[1]} are typing…`;
  }
  return `${visible[0]} is typing…`;
}

function PresenceAvatarsSubscriber({
  contextType,
  contextId,
  selfUserId,
  shapeUrl,
  className,
}: {
  contextType: PresenceContextType;
  contextId: string;
  selfUserId: string;
  shapeUrl: string;
  className?: string;
}) {
  const { isLoading, data } = useShape<PresenceRow>({
    url: shapeUrl,
    params: {
      table: "asafe_presence",
      contextType,
      contextId,
    },
  });

  // Re-evaluate the activity window on a slow tick so avatars fade out when
  // heartbeats stop, even if no new shape row arrives.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), ACTIVITY_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const activeUserIds = useMemo(() => {
    if (isLoading || !data) return [];
    const cutoff = now - PRESENCE_ACTIVE_WINDOW_MS;
    return [
      ...new Set(
        data
          .filter(
            (row) =>
              row.user_id !== selfUserId &&
              parsePresenceTimestamp(row.last_seen_at) >= cutoff,
          )
          .map((row) => row.user_id),
      ),
    ].sort();
  }, [isLoading, data, now, selfUserId]);

  // Typing indicators ride the same rows: typing=true beats arrive every ≤4s
  // while a teammate types, so a fresh last_seen_at (10s window) is the
  // liveness signal — a lost typing=false clear simply ages out.
  const typingUserIds = useMemo(() => {
    if (isLoading || !data) return [];
    const cutoff = now - TYPING_DISPLAY_WINDOW_MS;
    return [
      ...new Set(
        data
          .filter(
            (row) =>
              row.user_id !== selfUserId &&
              row.typing === true &&
              parsePresenceTimestamp(row.last_seen_at) >= cutoff,
          )
          .map((row) => row.user_id),
      ),
    ].sort();
  }, [isLoading, data, now, selfUserId]);

  // The 15s activity tick is too slow for the 10s typing window; tick faster
  // only while someone is actually typing.
  const someoneTyping = typingUserIds.length > 0;
  useEffect(() => {
    if (!someoneTyping) return;
    const tick = setInterval(() => setNow(Date.now()), TYPING_TICK_MS);
    return () => clearInterval(tick);
  }, [someoneTyping]);

  const { data: usersResponse } = useSWR<{ users: PresenceUser[] }>(
    activeUserIds.length > 0
      ? `/api/realtime/presence-users?ids=${activeUserIds.join(",")}`
      : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (activeUserIds.length === 0) return null;

  const userById = new Map(
    (usersResponse?.users ?? []).map((user) => [user.id, user]),
  );
  const visibleIds = activeUserIds.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = activeUserIds.length - visibleIds.length;
  // Typing users are a subset of active users, so their names resolve through
  // the same presence-users fetch; fall back while the lookup is in flight.
  const typingNames = typingUserIds.map(
    (userId) => userById.get(userId)?.name || "Someone",
  );

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div
        className="flex items-center -space-x-2"
        data-testid="presence-avatars"
      >
        {visibleIds.map((userId) => {
          const user = userById.get(userId);
          const name = user?.name ?? "";
          return (
            <Tooltip key={userId}>
              <TooltipTrigger asChild>
                <Avatar className="size-6 border border-border ring-2 ring-background">
                  {user?.image ? (
                    <AvatarImage src={user.image} alt={name} />
                  ) : null}
                  <AvatarFallback className="text-[9px] font-medium text-muted-foreground">
                    {initialsOf(name)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              {name ? (
                <TooltipContent side="bottom">{name}</TooltipContent>
              ) : null}
            </Tooltip>
          );
        })}
        {overflow > 0 && (
          <div className="size-6 rounded-full border border-border ring-2 ring-background bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
            +{overflow}
          </div>
        )}
      </div>
      {typingNames.length > 0 && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="presence-typing"
        >
          <span className="flex items-center gap-0.5" aria-hidden="true">
            <span className="size-1 rounded-full bg-current animate-pulse" />
            <span className="size-1 rounded-full bg-current animate-pulse [animation-delay:150ms]" />
            <span className="size-1 rounded-full bg-current animate-pulse [animation-delay:300ms]" />
          </span>
          <span>{typingLabel(typingNames)}</span>
        </div>
      )}
    </div>
  );
}

export function PresenceAvatars({
  contextType,
  contextId,
  selfUserId,
  className,
}: {
  contextType: PresenceContextType;
  contextId: string;
  selfUserId: string;
  className?: string;
}) {
  // Heartbeat: announce on mount and every 30s, but only while the tab is
  // visible — a hidden tab stops beating and the row simply ages out of the
  // 90s window on everyone else's screen.
  useEffect(() => {
    let cancelled = false;
    const beat = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      heartbeatPresenceAction(contextType, contextId).catch(() => {
        // Presence is best-effort chrome; never surface heartbeat failures.
      });
    };
    beat();
    const interval = setInterval(beat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [contextType, contextId]);

  // The Electric client needs an absolute URL; defer subscribing until we are
  // in the browser (same pattern as live-thread-messages.tsx).
  const [shapeUrl, setShapeUrl] = useState<string | null>(null);
  useEffect(() => {
    setShapeUrl(new URL(SHAPE_PROXY_PATH, window.location.origin).toString());
  }, []);

  if (!shapeUrl) return null;
  return (
    <PresenceAvatarsSubscriber
      contextType={contextType}
      contextId={contextId}
      selfUserId={selfUserId}
      shapeUrl={shapeUrl}
      className={className}
    />
  );
}
