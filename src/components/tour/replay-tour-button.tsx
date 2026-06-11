"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "ui/button";

import { TOUR_WELCOME } from "./tour-logic";
import { requestTourReplay } from "./tour-replay";

// Settings › Personalization affordance: queue a welcome-tour replay and
// head home, where the AppTours controller picks the request up (the tour
// anchors only exist on "/").
export function ReplayWelcomeTourButton() {
  const t = useTranslations("Tours");
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground w-fit"
      onClick={() => {
        requestTourReplay(TOUR_WELCOME);
        router.push("/");
      }}
    >
      <RotateCcw className="size-3.5" />
      {t("replayWelcome")}
    </Button>
  );
}
