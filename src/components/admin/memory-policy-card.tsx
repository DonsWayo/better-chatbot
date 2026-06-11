"use client";

import {
  updateOrgMemoryPolicyAction,
  updateTeamMemoryPolicyAction,
} from "@/app/api/admin/actions";
import type { TeamMemoryOverride } from "lib/memory/policy";
import { Brain, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Label } from "ui/label";
import { Separator } from "ui/separator";
import { Switch } from "ui/switch";
import type { TeamOption, TriState } from "./team-policy-overrides";
import { TeamOverrideCombobox, TriStateSelect } from "./team-policy-overrides";

// Admin › Feature flags — org-layer user-memory policy
// (docs/design/user-memory.md). Two switches over asafe_org_settings keys
// `memory_enabled` / `memory_implicit_extraction`, plus a "Team overrides"
// section editing the layered `team_memory_*:<teamId>` keys (tri-state per
// team: inherit / force on / force off; the resolver in lib/memory/policy.ts
// lets a set team value win over the org base).

interface MemoryPolicyCardProps {
  initialEnabled: boolean;
  initialImplicitExtraction: boolean;
  teams?: TeamOption[];
  initialOverrides?: TeamMemoryOverride[];
}

export function MemoryPolicyCard({
  initialEnabled,
  initialImplicitExtraction,
  teams = [],
  initialOverrides = [],
}: MemoryPolicyCardProps) {
  const t = useTranslations("Admin.MemoryPolicy");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [implicit, setImplicit] = useState(initialImplicitExtraction);
  const [overrides, setOverrides] =
    useState<TeamMemoryOverride[]>(initialOverrides);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const triLabels = {
    inherit: t("inherit"),
    on: t("forceOn"),
    off: t("forceOff"),
  };

  const teamName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.name ?? teamId;

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

  const addOverrideRow = (teamId: string) => {
    // Local row only — nothing is stored until a field leaves "inherit".
    setOverrides((prev) =>
      prev.some((o) => o.teamId === teamId)
        ? prev
        : [...prev, { teamId, enabled: null, implicitExtraction: null }],
    );
  };

  const updateOverride = (
    teamId: string,
    patch: { enabled?: TriState; implicitExtraction?: TriState },
  ) => {
    startTransition(async () => {
      setError(false);
      try {
        await updateTeamMemoryPolicyAction({ teamId, ...patch });
        setOverrides((prev) =>
          prev.map((o) => (o.teamId === teamId ? { ...o, ...patch } : o)),
        );
      } catch {
        setError(true);
      }
    });
  };

  const removeOverride = (teamId: string) => {
    startTransition(async () => {
      setError(false);
      try {
        const row = overrides.find((o) => o.teamId === teamId);
        // Only clear fields that are actually stored.
        if (row && (row.enabled !== null || row.implicitExtraction !== null)) {
          await updateTeamMemoryPolicyAction({
            teamId,
            ...(row.enabled !== null && { enabled: null }),
            ...(row.implicitExtraction !== null && {
              implicitExtraction: null,
            }),
          });
        }
        setOverrides((prev) => prev.filter((o) => o.teamId !== teamId));
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

        <Separator />

        <div className="flex flex-col gap-3">
          <div>
            <Label className="text-sm font-medium">{t("teamOverrides")}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("teamOverridesDescription")}
            </p>
          </div>

          {overrides.map((override) => (
            <div
              key={override.teamId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2"
              data-testid={`memory-team-override-${override.teamId}`}
            >
              <span className="text-sm flex-1 min-w-24 truncate">
                {teamName(override.teamId)}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {t("memoryShort")}
                </span>
                <TriStateSelect
                  value={override.enabled}
                  disabled={pending}
                  labels={triLabels}
                  ariaLabel={`${teamName(override.teamId)} — ${t("memoryShort")}`}
                  onChange={(v) =>
                    updateOverride(override.teamId, { enabled: v })
                  }
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {t("implicitShort")}
                </span>
                <TriStateSelect
                  value={override.implicitExtraction}
                  disabled={pending}
                  labels={triLabels}
                  ariaLabel={`${teamName(override.teamId)} — ${t("implicitShort")}`}
                  onChange={(v) =>
                    updateOverride(override.teamId, { implicitExtraction: v })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                disabled={pending}
                aria-label={t("removeOverride")}
                title={t("removeOverride")}
                onClick={() => removeOverride(override.teamId)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}

          <div>
            <TeamOverrideCombobox
              teams={teams}
              excludeIds={overrides.map((o) => o.teamId)}
              disabled={pending}
              placeholder={t("addTeamOverride")}
              searchPlaceholder={t("searchTeams")}
              emptyText={t("noTeamsFound")}
              onSelect={addOverrideRow}
              testId="memory-team-override-add"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
