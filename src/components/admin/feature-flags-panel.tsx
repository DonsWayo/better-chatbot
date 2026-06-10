"use client";

import { toggleFeatureFlagAction } from "@/app/api/admin/actions";
import { AlertTriangle, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { Switch } from "ui/switch";

interface FeatureFlag {
  name: string;
  enabled: boolean;
  updatedAt: Date | string;
}

interface FeatureFlagsPanelProps {
  initialFlags: FeatureFlag[];
}

async function toggleFlag(name: string, enabled: boolean): Promise<boolean> {
  try {
    await toggleFeatureFlagAction(name, enabled);
    return true;
  } catch {
    return false;
  }
}

export function FeatureFlagsPanel({ initialFlags }: FeatureFlagsPanelProps) {
  const t = useTranslations("Admin.FeatureFlags");
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const handleToggle = (name: string, newValue: boolean) => {
    startTransition(async () => {
      const ok = await toggleFlag(name, newValue);
      if (ok) {
        setFlags((prev) =>
          prev.map((f) => (f.name === name ? { ...f, enabled: newValue } : f)),
        );
        if (name === "kill_switch") {
          setMessage({
            text: newValue ? t("activated") : t("deactivated"),
            type: newValue ? "error" : "success",
          });
        } else {
          setMessage({ text: t("flagUpdated"), type: "success" });
        }
      } else {
        setMessage({
          text: "Failed to update flag. Please try again.",
          type: "error",
        });
      }
      setTimeout(() => setMessage(null), 5_000);
    });
  };

  const killSwitch = flags.find((f) => f.name === "kill_switch");
  const otherFlags = flags.filter((f) => f.name !== "kill_switch");

  return (
    <div className="space-y-6 p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Operator controls for platform-wide behaviour. Changes take effect
          within 5 seconds.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-700 dark:text-green-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Kill switch — prominent card */}
      {killSwitch && (
        <Card
          className={
            killSwitch.enabled
              ? "border-destructive bg-destructive/5"
              : "border-border"
          }
          data-testid="kill-switch-card"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {killSwitch.enabled ? (
                  <AlertTriangle className="size-5 text-destructive" />
                ) : (
                  <Zap className="size-5 text-muted-foreground" />
                )}
                <CardTitle className="text-base">{t("killSwitch")}</CardTitle>
                <Badge
                  variant="secondary"
                  className={
                    killSwitch.enabled
                      ? "rounded-full border-transparent bg-red-500/15 text-red-600 dark:text-red-400"
                      : "rounded-full"
                  }
                  data-testid="kill-switch-badge"
                >
                  {killSwitch.enabled ? "active" : "inactive"}
                </Badge>
              </div>
              <Switch
                checked={killSwitch.enabled}
                disabled={pending}
                onCheckedChange={(v) => handleToggle("kill_switch", v)}
                data-testid="kill-switch-toggle"
                aria-label={t("killSwitch")}
              />
            </div>
            <CardDescription className="mt-2">
              {t("killSwitchDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Last updated:{" "}
              {new Date(killSwitch.updatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Other flags */}
      {otherFlags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other Flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {otherFlags.map((flag) => (
              <div
                key={flag.name}
                className="flex items-center justify-between rounded-xl border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{flag.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Updated:{" "}
                    {new Date(flag.updatedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="secondary"
                    className={
                      flag.enabled
                        ? "rounded-full border-transparent bg-green-500/15 text-green-600 dark:text-green-400"
                        : "rounded-full"
                    }
                  >
                    {flag.enabled ? "on" : "off"}
                  </Badge>
                  <Switch
                    checked={flag.enabled}
                    disabled={pending}
                    onCheckedChange={(v) => handleToggle(flag.name, v)}
                    aria-label={flag.name}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {flags.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No feature flags configured.
        </p>
      )}
    </div>
  );
}
