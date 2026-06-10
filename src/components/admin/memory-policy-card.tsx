"use client";

import { updateOrgMemoryPolicyAction } from "@/app/api/admin/actions";
import { Brain } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Label } from "ui/label";
import { Switch } from "ui/switch";

// Admin › Operator controls — org-layer user-memory policy
// (docs/design/user-memory.md). Two switches over asafe_org_settings keys
// `memory_enabled` / `memory_implicit_extraction`; per-team overrides exist
// as `team_memory_*:<teamId>` keys (no UI yet — set via the policy lib).

interface MemoryPolicyCardProps {
  initialEnabled: boolean;
  initialImplicitExtraction: boolean;
}

export function MemoryPolicyCard({
  initialEnabled,
  initialImplicitExtraction,
}: MemoryPolicyCardProps) {
  const t = useTranslations("Admin.MemoryPolicy");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [implicit, setImplicit] = useState(initialImplicitExtraction);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const update = (patch: {
    enabled?: boolean;
    implicitExtraction?: boolean;
  }) => {
    startTransition(async () => {
      setError(false);
      try {
        await updateOrgMemoryPolicyAction(patch);
        if (typeof patch.enabled === "boolean") setEnabled(patch.enabled);
        if (typeof patch.implicitExtraction === "boolean")
          setImplicit(patch.implicitExtraction);
      } catch {
        setError(true);
      }
    });
  };

  return (
    <Card data-testid="memory-policy-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-muted-foreground" />
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && (
          <p className="text-sm text-destructive">{t("updateFailed")}</p>
        )}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">{t("memoryEnabled")}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("memoryEnabledDescription")}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={pending}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">
              {t("implicitExtraction")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("implicitExtractionDescription")}
            </p>
          </div>
          <Switch
            checked={implicit}
            disabled={pending || !enabled}
            onCheckedChange={(v) => update({ implicitExtraction: v })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
