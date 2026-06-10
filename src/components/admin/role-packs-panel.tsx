"use client";

import { installRolePackAction } from "@/app/(chat)/(admin)/admin/role-packs/actions";
import { Bot, CalendarClock, Check, Package, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "ui/card";

// Admin → Role packs: two calm cards listing exactly what each pack installs
// (agents, workflow, disabled routine) with a one-click idempotent install.

export type RolePackView = {
  id: string;
  title: string;
  tagline: string;
  agents: { name: string; description: string }[];
  workflow: { name: string; description: string };
  schedule: {
    label: string;
    description: string;
    cronExpr: string;
    timezone: string;
  };
  installed: boolean;
  installedCount: number;
  totalCount: number;
};

interface RolePacksPanelProps {
  packs: RolePackView[];
}

export function RolePacksPanel({ packs }: RolePacksPanelProps) {
  const t = useTranslations("Admin.RolePacks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [installingId, setInstallingId] = useState<string | null>(null);

  const handleInstall = (packId: string) => {
    setInstallingId(packId);
    startTransition(async () => {
      try {
        const result = await installRolePackAction(packId);
        if (result.created.length === 0) {
          toast.info(t("nothingToInstall"));
        } else {
          toast.success(
            t("installResult", {
              created: result.created.length,
              skipped: result.skipped.length,
            }),
          );
        }
        router.refresh();
      } catch {
        toast.error(t("installFailed"));
      } finally {
        setInstallingId(null);
      }
    });
  };

  return (
    <div className="space-y-6 p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {packs.map((pack) => (
          <Card key={pack.id} data-testid={`role-pack-card-${pack.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="size-5 text-muted-foreground" />
                  <CardTitle className="text-base">{pack.title}</CardTitle>
                </div>
                {pack.installed ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full border-transparent bg-green-500/15 text-green-600 dark:text-green-400"
                    data-testid={`role-pack-installed-${pack.id}`}
                  >
                    {t("installed")}
                  </Badge>
                ) : pack.installedCount > 0 ? (
                  <Badge variant="secondary" className="rounded-full">
                    {t("partiallyInstalled", {
                      installed: pack.installedCount,
                      total: pack.totalCount,
                    })}
                  </Badge>
                ) : null}
              </div>
              <CardDescription className="mt-2">{pack.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {pack.agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
                  >
                    <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
                  <Workflow className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{pack.workflow.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pack.workflow.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {pack.schedule.label}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {pack.schedule.cronExpr} · {pack.schedule.timezone}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pack.schedule.description}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("disabledNote")}
              </p>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => handleInstall(pack.id)}
                disabled={pending || pack.installed}
                variant={pack.installed ? "secondary" : "default"}
                data-testid={`role-pack-install-${pack.id}`}
              >
                {pack.installed ? (
                  <>
                    <Check className="size-4" />
                    {t("installed")}
                  </>
                ) : installingId === pack.id ? (
                  t("installing")
                ) : (
                  t("install")
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
