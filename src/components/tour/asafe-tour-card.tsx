"use client";

import { cn } from "lib/utils";
import { useTranslations } from "next-intl";
import type { CardComponentProps } from "nextstepjs";
import { Button } from "ui/button";

// Custom NextStep card following docs/design/ui-language.md: rounded-2xl
// card surface, Bricolage display title, exactly one filled teal action
// (Next/Done), ghost Back/Skip, tiny step dots. NextStep ships no a11y
// semantics, so the dialog role/labels live here. ←/→/Esc keyboard control
// is built into NextStep itself.
export function AsafeTourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const t = useTranslations("Tours");
  const isLast = currentStep === totalSteps - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      className="relative w-80 max-w-[calc(100vw-2rem)] rounded-2xl border bg-card text-card-foreground shadow-lg p-5 flex flex-col gap-3"
    >
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {step.title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {step.content}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div
          className="flex items-center gap-1.5"
          aria-label={t("stepOf", {
            current: currentStep + 1,
            total: totalSteps,
          })}
        >
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === currentStep ? "bg-primary" : "bg-muted-foreground/25",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-1">
          {currentStep > 0 && (
            <Button variant="ghost" size="sm" onClick={prevStep}>
              {t("back")}
            </Button>
          )}
          {skipTour && !isLast && step.showSkip !== false && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={skipTour}
            >
              {t("skip")}
            </Button>
          )}
          {/* The one filled teal action per view (ui-language.md §2) */}
          <Button size="sm" autoFocus onClick={nextStep}>
            {isLast ? t("done") : t("next")}
          </Button>
        </div>
      </div>

      {/* Pointer arrow — inherits text color, so paint it card-colored */}
      <span className="text-card">{arrow}</span>
    </div>
  );
}
