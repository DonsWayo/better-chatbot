"use client";

import type { UserPreferences } from "app-types/user";
import { fetcher } from "lib/utils";
import { usePathname } from "next/navigation";
import { NextStep, NextStepProvider, useNextStep } from "nextstepjs";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";

import { AsafeTourCard } from "./asafe-tour-card";
import { withCompletedTour } from "./tour-logic";
import { consumeTourReplay } from "./tour-replay";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { useTourSteps } from "./use-tour-steps";

// Tours are OPT-IN only. Auto-start has been removed — it blocked users who
// hadn't completed a tour after deploys / DB resets. The replay button in
// Settings > Personalization still triggers any tour on demand.

const REPLAY_DELAY_MS = 800;

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
      <TourReplayOnly />
      {children}
    </NextStepProvider>
  );
}

// Fires only when the user explicitly requests a tour replay from Settings.
// No automatic tour triggers — those were removed because they blocked
// users unexpectedly after every re-login or DB reset.
function TourReplayOnly() {
  const pathname = usePathname();
  const { startNextStep, isNextStepVisible } = useNextStep();

  useEffect(() => {
    if (isNextStepVisible || pathname !== "/") return;
    const timer = setTimeout(() => {
      const replay = consumeTourReplay();
      if (!replay) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      startNextStep(replay);
    }, REPLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, isNextStepVisible, startNextStep]);

  return null;
}
