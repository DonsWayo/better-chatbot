"use client";

import {
  updateOrgLocalMcpPolicyAction,
  updateTeamLocalMcpPolicyAction,
} from "@/app/api/admin/actions";
import { TerminalSquare, X } from "lucide-react";
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

// Admin › Feature flags — local-MCP governance plane (ADR-0010). Org-base
// switch over the asafe_org_settings `local_mcp_enabled` key (default-deny
// per ADR-0009), plus a "Team overrides" section editing the layered
// `team_local_mcp_enabled:<teamId>` keys (tri-state per team: inherit /
// force on / force off). Every change re-resolves the MCP manager's
// process-wide runtime gate server-side.

interface TeamLocalMcpOverrideRow {
  teamId: string;
  enabled: TriState;
}

interface LocalMcpPolicyCardProps {
  initialEnabled: boolean;
  teams?: TeamOption[];
  initialOverrides?: { teamId: string; enabled: boolean }[];
}

export function LocalMcpPolicyCard({
  initialEnabled,
  teams = [],
  initialOverrides = [],
}: LocalMcpPolicyCardProps) {
  const t = useTranslations("Admin.LocalMcpPolicy");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [overrides, setOverrides] =
    useState<TeamLocalMcpOverrideRow[]>(initialOverrides);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const triLabels = {
    inherit: t("inherit"),
    on: t("forceOn"),
    off: t("forceOff"),
  };

  const teamName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.name ?? teamId;

  const update = (next: boolean) => {
    startTransition(async () => {
      setError(false);
      try {
        await updateOrgLocalMcpPolicyAction({ enabled: next });
        setEnabled(next);
      } catch {
        setError(true);
      }
    });
  };

  const addOverrideRow = (teamId: string) => {
    // Local row only — nothing is stored until the value leaves "inherit".
    setOverrides((prev) =>
      prev.some((o) => o.teamId === teamId)
        ? prev
        : [...prev, { teamId, enabled: null }],
    );
  };

  const updateOverride = (teamId: string, value: TriState) => {
    startTransition(async () => {
      setError(false);
      try {
        await updateTeamLocalMcpPolicyAction({ teamId, enabled: value });
        setOverrides((prev) =>
          prev.map((o) => (o.teamId === teamId ? { ...o, enabled: value } : o)),
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
        // Only clear when a value is actually stored.
        if (row && row.enabled !== null) {
          await updateTeamLocalMcpPolicyAction({ teamId, enabled: null });
        }
        setOverrides((prev) => prev.filter((o) => o.teamId !== teamId));
      } catch {
        setError(true);
      }
    });
  };

  return (
    <Card data-testid="local-mcp-policy-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TerminalSquare className="size-5 text-muted-foreground" />
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
            <Label className="text-sm font-medium">{t("enabled")}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("enabledDescription")}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={pending}
            onCheckedChange={(v) => update(v)}
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
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              data-testid={`local-mcp-team-override-${override.teamId}`}
            >
              <span className="text-sm flex-1 min-w-24 truncate">
                {teamName(override.teamId)}
              </span>
              <TriStateSelect
                value={override.enabled}
                disabled={pending}
                labels={triLabels}
                ariaLabel={teamName(override.teamId)}
                onChange={(v) => updateOverride(override.teamId, v)}
              />
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
              testId="local-mcp-team-override-add"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
