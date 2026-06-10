"use client";

import { updateOrgLocalMcpPolicyAction } from "@/app/api/admin/actions";
import { TerminalSquare } from "lucide-react";
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

// Admin › Feature flags — org-base switch for the local-MCP governance plane
// (ADR-0010). One switch over the asafe_org_settings `local_mcp_enabled` key
// (default-deny per ADR-0009); per-team overrides exist as
// `team_local_mcp_enabled:<teamId>` keys (no UI yet — set via the policy lib;
// full team UI is a follow-up).

interface LocalMcpPolicyCardProps {
  initialEnabled: boolean;
}

export function LocalMcpPolicyCard({
  initialEnabled,
}: LocalMcpPolicyCardProps) {
  const t = useTranslations("Admin.LocalMcpPolicy");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

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
      </CardContent>
    </Card>
  );
}
