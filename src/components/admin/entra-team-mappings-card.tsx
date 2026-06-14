"use client";

import { updateEntraTeamMappingsAction } from "@/app/api/admin/actions";
import type { EntraTeamMapping } from "lib/auth/entra-team-mappings";
import { KeyRound, Plus, X } from "lucide-react";
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
import { Input } from "ui/input";
import { Label } from "ui/label";
import type { TeamOption } from "./team-policy-overrides";
import { TeamOverrideCombobox } from "./team-policy-overrides";

// Admin › Teams — Microsoft Entra group → team auto-assignment (Wave 4,
// ADR-0005). Edits the `entra_team_mappings` org-settings key via
// updateEntraTeamMappingsAction (audit-logged). On every SSO sign-in the
// auth hook ensures membership (role "member") in each mapped team present
// in the user's `groups` claim — additive only, never removes/downgrades.

interface EntraTeamMappingsCardProps {
  initialMappings: EntraTeamMapping[];
  teams: TeamOption[];
}

export function EntraTeamMappingsCard({
  initialMappings,
  teams,
}: EntraTeamMappingsCardProps) {
  const t = useTranslations("Admin.EntraTeamMappings");
  const [mappings, setMappings] = useState<EntraTeamMapping[]>(initialMappings);
  const [draftGroupId, setDraftGroupId] = useState("");
  const [draftTeamId, setDraftTeamId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const teamName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.name ?? teamId;

  const save = (next: EntraTeamMapping[]) => {
    startTransition(async () => {
      setError(false);
      try {
        const saved = await updateEntraTeamMappingsAction(next);
        setMappings(saved);
      } catch {
        setError(true);
      }
    });
  };

  const groupId = draftGroupId.trim();
  const duplicate =
    !!draftTeamId &&
    mappings.some((m) => m.groupId === groupId && m.teamId === draftTeamId);
  const canAdd = !!groupId && !!draftTeamId && !duplicate && !pending;

  const addMapping = () => {
    if (!canAdd || !draftTeamId) return;
    save([...mappings, { groupId, teamId: draftTeamId }]);
    setDraftGroupId("");
    setDraftTeamId(null);
  };

  const removeMapping = (index: number) => {
    save(mappings.filter((_, i) => i !== index));
  };

  return (
    <Card data-testid="entra-team-mappings-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-muted-foreground" />
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <p className="text-sm text-destructive">{t("updateFailed")}</p>
        )}

        {mappings.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("noMappings")}</p>
        )}

        {mappings.map((mapping, index) => (
          <div
            key={`${mapping.groupId}:${mapping.teamId}`}
            className="flex items-center gap-3 rounded-lg border px-3 py-2"
            data-testid={`entra-team-mapping-${mapping.groupId}`}
          >
            <code className="text-xs flex-1 min-w-24 truncate text-muted-foreground">
              {mapping.groupId}
            </code>
            <span className="text-xs text-muted-foreground">→</span>
            <span className="text-sm min-w-24 truncate">
              {teamName(mapping.teamId)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              disabled={pending}
              aria-label={t("removeMapping")}
              title={t("removeMapping")}
              onClick={() => removeMapping(index)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}

        <div className="flex flex-col gap-2 pt-1">
          <Label className="text-sm font-medium">{t("addMapping")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={draftGroupId}
              onChange={(e) => setDraftGroupId(e.target.value)}
              placeholder={t("groupIdPlaceholder")}
              className="h-8 flex-1 min-w-0 sm:w-72 max-w-full font-mono text-xs"
              disabled={pending}
              data-testid="entra-team-mapping-group-input"
            />
            <TeamOverrideCombobox
              teams={teams}
              excludeIds={[]}
              disabled={pending}
              placeholder={
                draftTeamId ? teamName(draftTeamId) : t("selectTeam")
              }
              searchPlaceholder={t("searchTeams")}
              emptyText={t("noTeamsFound")}
              onSelect={setDraftTeamId}
              testId="entra-team-mapping-team-combobox"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canAdd}
              onClick={addMapping}
              data-testid="entra-team-mapping-add"
            >
              <Plus className="size-3.5" />
              {t("add")}
            </Button>
          </div>
          {duplicate && (
            <p className="text-xs text-muted-foreground">
              {t("duplicateMapping")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
