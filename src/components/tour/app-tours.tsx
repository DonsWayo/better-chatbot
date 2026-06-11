"use client";

import type { UserPreferences } from "app-types/user";
import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "lib/auth/client-permissions";
import { fetcher } from "lib/utils";
import { usePathname } from "next/navigation";
import { NextStep, NextStepProvider, useNextStep } from "nextstepjs";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";

import { AsafeTourCard } from "./asafe-tour-card";
import { resolveAutoTour, withCompletedTour } from "./tour-logic";
import { consumeTourReplay } from "./tour-replay";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useTourSteps } from "./use-tour-steps";

// Onboarding tours (NextStep v2). Mounted once in the (chat) layout; the
// layout stays a server component — this is the client boundary and the
// page tree passes through as a slot, NOT through NextStep's wrapper divs
// (they would add block wrappers around the page). NextStep only needs to
// be mounted for its portal overlay, so it gets an empty slot.
//
// Auto-start rules live in tour-logic.ts (pure, tested). Completion/skip is
// persisted to UserPreferences.completedTours via the existing
// /api/user/preferences route.

const AUTO_START_DELAY_MS = 800;

export function AppTours({
  userRole,
  children,
}: {
  userRole?: string | null;
  children?: ReactNode;
}) {
  const tours = useTourSteps(userRole);
  const reducedMotion = usePrefersReducedMotion();

  const { data: prefs, mutate } = useSWR<UserPreferences>(
    "/api/user/preferences",
    fetcher,
  );

  // Keep the latest prefs in a ref so the NextStep callbacks never persist
  // from a stale snapshot.
  const prefsRef = useRef<UserPreferences | undefined>(prefs);
  prefsRef.current = prefs;

  const markTourDone = useCallback(
    async (tourName: string | null) => {
      if (!tourName) return;
      const current = prefsRef.current ?? {};
      const completedTours = withCompletedTour(
        current.completedTours,
        tourName,
      );
      if (completedTours === current.completedTours) return;
      const next = { ...current, completedTours };
      // Optimistic local update so the auto-start controller stops retrying
      // immediately, then persist through the existing preferences route.
      mutate(next, { revalidate: false });
      await fetch("/api/user/preferences", {
        method: "PUT",
        body: JSON.stringify(next),
      }).catch(() => {});
    },
    [mutate],
  );

  return (
    <NextStepProvider>
      <NextStep
        steps={tours}
        cardComponent={AsafeTourCard}
        shadowRgb="0, 0, 0"
        shadowOpacity="0.5"
        cardTransition={
          reducedMotion
            ? { duration: 0.01 }
            : { ease: "anticipate", duration: 0.5 }
        }
        onComplete={markTourDone}
        onSkip={(_step, tourName) => markTourDone(tourName)}
        disableConsoleLogs
      >
        {null}
      </NextStep>
      <TourAutoStart
        userRole={userRole}
        completedTours={prefs?.completedTours}
        prefsLoaded={prefs !== undefined}
      />
      {children}
    </NextStepProvider>
  );
}

// Watches the pathname and fires the right tour on first contact with a
// surface: welcome on "/", studio on first /studio visit, admin on first
// /admin visit. One mechanism for all three (and for Settings replays).
function TourAutoStart({
  userRole,
  completedTours,
  prefsLoaded,
}: {
  userRole?: string | null;
  completedTours?: string[];
  prefsLoaded: boolean;
}) {
  const pathname = usePathname();
  const { startNextStep, isNextStepVisible } = useNextStep();
  // Tours already fired this session — guards the gap between starting a
  // tour and its completion landing in preferences.
  const startedRef = useRef<Set<string>>(new Set());

  // The AUP modal (first login, EU AI Act) must win over the tour. Poll
  // until accepted, then let the tour start.
  const { data: aup } = useSWR<{ accepted?: boolean }>(
    "/api/compliance/aup",
    fetcher,
    { refreshInterval: (data) => (data?.accepted === false ? 4000 : 0) },
  );
  const aupPending = aup?.accepted === false; // fail open on error/loading

  useEffect(() => {
    if (!prefsLoaded || aupPending || isNextStepVisible) return;

    const canSeeStudio =
      canCreateAgent(userRole) ||
      canCreateWorkflow(userRole) ||
      canEditWorkflow(userRole);
    const isAdmin = userRole === "admin";

    // Small delay so the anchors (sidebar, composer) are mounted and any
    // just-opened modal is in the DOM before we decide.
    const timer = setTimeout(() => {
      const replay = pathname === "/" ? consumeTourReplay() : null;
      const tour =
        replay ??
        resolveAutoTour({
          pathname,
          completedTours: completedTours ?? [],
          canSeeStudio,
          isAdmin,
        });
      if (!tour) return;
      if (!replay && startedRef.current.has(tour)) return;
      // Never start on top of an open modal dialog (AUP, command palette…)
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      startedRef.current.add(tour);
      startNextStep(tour);
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    pathname,
    prefsLoaded,
    aupPending,
    isNextStepVisible,
    completedTours,
    userRole,
    startNextStep,
  ]);

  return null;
}
