"use client";

import {
  MEMORY_CHECK_DELAYS_MS,
  countNewMemories,
  isTurnActiveStatus,
  turnJustCompleted,
} from "lib/memory/turn-indicator";
import { Brain, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Calm in-chat "Memory updated" indicator (docs/design/user-memory.md
// follow-up). Memory extraction is fire-and-forget AFTER the response stream,
// so the chat response cannot carry a "stored" signal; instead, when a turn
// settles (streaming → ready) this checks GET /api/memory?since=<turn start>
// at most twice (4s, 10s — MEMORY_CHECK_DELAYS_MS) and shows a small
// dismissible pill near the composer when the turn stored ≥1 memory.
// Mounted once in chat-bot.tsx; shows at most once per turn; no polling loops.

interface MemoryUpdatedPillProps {
  threadId: string;
  status: string;
}

export function MemoryUpdatedPill({
  threadId,
  status,
}: MemoryUpdatedPillProps) {
  const t = useTranslations("Chat");
  const [visible, setVisible] = useState(false);
  const prevStatusRef = useRef(status);
  const turnStartRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  };

  // Reset everything when switching threads.
  useEffect(() => {
    clearTimers();
    setVisible(false);
    turnStartRef.current = null;
    return clearTimers;
  }, [threadId]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === status) return;

    if (!isTurnActiveStatus(prev) && isTurnActiveStatus(status)) {
      // New turn started — stamp it and drop any stale pill/checks.
      turnStartRef.current = new Date().toISOString();
      clearTimers();
      setVisible(false);
      return;
    }

    if (turnJustCompleted(prev, status) && turnStartRef.current) {
      const since = turnStartRef.current;
      turnStartRef.current = null; // at most one check cycle per turn
      let found = false;
      timersRef.current = MEMORY_CHECK_DELAYS_MS.map((delay) =>
        window.setTimeout(async () => {
          if (found) return;
          try {
            const res = await fetch(
              `/api/memory?since=${encodeURIComponent(since)}`,
            );
            if (!res.ok) return;
            if (countNewMemories(await res.json()) > 0) {
              found = true;
              clearTimers();
              setVisible(true);
            }
          } catch {
            // Best-effort indicator — stay silent on failure.
          }
        }, delay),
      );
    }
  }, [status]);

  if (!visible) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 pb-2 flex justify-center">
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/80 backdrop-blur-sm px-3 py-1 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1">
        <Brain className="size-3" />
        <span>{t("memoryUpdated")}</span>
        <span aria-hidden>·</span>
        <Link
          href="/settings/personalization"
          className="text-foreground hover:underline"
        >
          {t("memoryUpdatedView")}
        </Link>
        <button
          type="button"
          aria-label={t("memoryUpdatedDismiss")}
          className="ml-0.5 rounded-full p-0.5 hover:text-foreground"
          onClick={() => setVisible(false)}
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
