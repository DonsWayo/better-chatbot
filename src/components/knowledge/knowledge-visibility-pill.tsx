"use client";

import { Building2, Lock, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Visibility } from "lib/visibility";
import { Badge } from "ui/badge";

import { normalizeCollectionVisibility } from "./types";

const LEVEL_ICONS: Record<Visibility, typeof Lock> = {
  private: Lock,
  shared: UserPlus,
  team: Users,
  company: Building2,
};

/** Tinted pill showing a collection's visibility level (legacy-aware). */
export function KnowledgeVisibilityPill({
  visibility,
}: {
  visibility: string | null | undefined;
}) {
  const t = useTranslations("Visibility");
  const level = normalizeCollectionVisibility(visibility);
  const Icon = LEVEL_ICONS[level];
  return (
    <Badge
      variant="secondary"
      className="gap-1 rounded-full font-normal text-muted-foreground"
      data-testid="knowledge-visibility-pill"
    >
      <Icon className="size-3" aria-hidden />
      {t(level)}
    </Badge>
  );
}
