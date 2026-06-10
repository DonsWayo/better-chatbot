"use client";

import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { CHORD_TIMEOUT_MS, resolveChordKey } from "lib/keyboard-shortcuts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
};

/**
 * Global two-key navigation chords (Linear/Superhuman style):
 * g then h/i/s/a/c/p navigates. The chord window lasts CHORD_TIMEOUT_MS;
 * Escape, a modifier, or an unknown second key cancels it.
 * Mounted once in AppPopupProvider. Renders nothing.
 */
export function GChordNavigation({
  userRole,
}: {
  userRole?: string | null;
}) {
  const router = useRouter();
  const armedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSeeStudio = useMemo(
    () =>
      canCreateAgent(userRole) ||
      canCreateWorkflow(userRole) ||
      canEditWorkflow(userRole),
    [userRole],
  );

  useEffect(() => {
    const disarm = () => {
      armedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const action = resolveChordKey(
        armedRef.current,
        {
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          isEditableTarget: isEditableEventTarget(e.target),
        },
        { canSeeStudio },
      );

      switch (action.type) {
        case "arm":
          disarm();
          armedRef.current = true;
          timerRef.current = setTimeout(() => {
            armedRef.current = false;
            timerRef.current = null;
          }, CHORD_TIMEOUT_MS);
          break;
        case "navigate":
          e.preventDefault();
          disarm();
          router.push(action.href);
          break;
        case "cancel":
          disarm();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      disarm();
    };
  }, [canSeeStudio, router]);

  return null;
}
