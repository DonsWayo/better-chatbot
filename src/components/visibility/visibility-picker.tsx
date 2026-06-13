"use client";

import {
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { safe } from "ts-safe";

import {
  type GrantWithGrantee,
  grantAccessAction,
  listGrantsAction,
  resolveGranteeByEmailAction,
  revokeAccessAction,
} from "@/app/api/visibility/actions";
import { cn } from "lib/utils";
import type { Capability, Visibility } from "lib/visibility";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Checkbox } from "ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "ui/command";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { handleErrorWithToast } from "ui/shared-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

/** The entity types this picker can manage grants for (subset of the model). */
export type VisibilityPickerEntityType = "workflow" | "agent";

export interface TeamOption {
  id: string;
  name: string;
}

/**
 * The value the picker owns and emits. `teamIds` is only meaningful at the
 * "team" level but is preserved across level changes so toggling back doesn't
 * lose the selection. Grants (the "shared" level) are managed out-of-band via
 * the server actions and are NOT part of this value.
 */
export interface VisibilityValue {
  visibility: Visibility;
  teamIds: string[];
}

interface VisibilityPickerProps {
  /** Current value (controlled). */
  value: VisibilityValue;
  /** Emitted whenever the level or the selected teams change. */
  onChange: (value: VisibilityValue) => void;
  /** Teams the current user can share into (their memberships). */
  teams: TeamOption[];
  /** Whether the viewer is an org admin — gates the "company" level. */
  isAdmin: boolean;
  /**
   * Entity identity for the grant manager. When absent (e.g. a not-yet-created
   * entity) the "shared" grant list is hidden — grants can only be added once
   * the row exists. The level itself is still selectable.
   */
  entity?: { type: VisibilityPickerEntityType; id: string };
  /** Disable the whole control (e.g. no edit access / saving in flight). */
  disabled?: boolean;
  className?: string;
}

const CAPABILITIES: Capability[] = ["use", "edit", "manage"];

type LevelMeta = {
  level: Visibility;
  icon: typeof Lock;
  labelKey: string;
  descriptionKey: string;
};

const LEVELS: LevelMeta[] = [
  {
    level: "private",
    icon: Lock,
    labelKey: "Visibility.private",
    descriptionKey: "Visibility.privateDescription",
  },
  {
    level: "shared",
    icon: UserPlus,
    labelKey: "Visibility.shared",
    descriptionKey: "Visibility.sharedDescription",
  },
  {
    level: "team",
    icon: Users,
    labelKey: "Visibility.team",
    descriptionKey: "Visibility.teamDescription",
  },
  {
    level: "company",
    icon: Building2,
    labelKey: "Visibility.company",
    descriptionKey: "Visibility.companyDescription",
  },
];

export function VisibilityPicker({
  value,
  onChange,
  teams,
  isAdmin,
  entity,
  disabled = false,
  className,
}: VisibilityPickerProps) {
  const t = useTranslations();
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  const selectLevel = useCallback(
    (level: Visibility) => {
      if (level === "company" && !isAdmin) return;
      onChange({ ...value, visibility: level });
    },
    [isAdmin, onChange, value],
  );

  const toggleTeam = useCallback(
    (teamId: string) => {
      const next = value.teamIds.includes(teamId)
        ? value.teamIds.filter((id) => id !== teamId)
        : [...value.teamIds, teamId];
      onChange({ ...value, teamIds: next });
    },
    [onChange, value],
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="radiogroup"
        aria-label={t("Visibility.label")}
        className="flex flex-col gap-1.5"
      >
        {LEVELS.map((meta) => {
          const Icon = meta.icon;
          const selected = value.visibility === meta.level;
          const lockedCompany = meta.level === "company" && !isAdmin;
          const item = (
            <button
              key={meta.level}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled || lockedCompany}
              data-testid={`visibility-level-${meta.level}`}
              onClick={() => selectLevel(meta.level)}
              className={cn(
                "group flex items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
                  selected
                    ? "border-primary/60 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t(meta.labelKey)}
                  {selected && (
                    <Check className="size-3.5 text-primary" aria-hidden />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(meta.descriptionKey)}
                </span>
              </span>
            </button>
          );

          if (lockedCompany) {
            return (
              <Tooltip key={meta.level}>
                <TooltipTrigger asChild>
                  <span tabIndex={-1}>{item}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {t("Visibility.companyAdminOnly")}
                </TooltipContent>
              </Tooltip>
            );
          }
          return item;
        })}
      </div>

      {value.visibility === "team" && (
        <div
          className="flex flex-col gap-2"
          data-testid="visibility-team-panel"
        >
          <Label className="text-xs text-muted-foreground">
            {t("Visibility.teamsLabel")}
          </Label>
          <Popover open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={teamPickerOpen}
                disabled={disabled}
                className="w-full justify-between rounded-full font-normal"
                data-testid="visibility-teams-trigger"
              >
                <span className="flex items-center gap-2 truncate text-muted-foreground">
                  <Users className="size-4 shrink-0" />
                  {value.teamIds.length === 0
                    ? t("Visibility.selectTeams")
                    : t("Visibility.teamsSelected", {
                        count: value.teamIds.length,
                      })}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0"
              align="start"
            >
              <Command>
                <CommandInput placeholder={t("Visibility.searchTeams")} />
                <CommandList>
                  <CommandEmpty>{t("Visibility.noTeams")}</CommandEmpty>
                  <CommandGroup>
                    {teams.map((team) => {
                      const checked = value.teamIds.includes(team.id);
                      return (
                        <CommandItem
                          key={team.id}
                          value={team.name}
                          onSelect={() => toggleTeam(team.id)}
                          className="gap-2"
                        >
                          <Checkbox
                            checked={checked}
                            className="pointer-events-none"
                            aria-hidden
                          />
                          <span className="flex-1 truncate">{team.name}</span>
                          {checked && <Check className="size-4 text-primary" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {value.teamIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {value.teamIds.map((id) => {
                const team = teams.find((tm) => tm.id === id);
                if (!team) return null;
                return (
                  <Badge key={id} variant="secondary" className="gap-1 pr-1">
                    {team.name}
                    <button
                      type="button"
                      onClick={() => toggleTeam(id)}
                      className="rounded-sm opacity-70 hover:opacity-100"
                      aria-label={t("Visibility.removeTeam", {
                        name: team.name,
                      })}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          {teams.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("Visibility.noTeamsMembership")}
            </p>
          )}
        </div>
      )}

      {value.visibility === "shared" &&
        (entity ? (
          <GrantManager entity={entity} disabled={disabled} />
        ) : (
          <p
            className="text-xs text-muted-foreground"
            data-testid="visibility-shared-unsaved"
          >
            {t("Visibility.sharedSaveFirst")}
          </p>
        ))}
    </div>
  );
}

interface GrantManagerProps {
  entity: { type: VisibilityPickerEntityType; id: string };
  disabled?: boolean;
}

/**
 * Lists + edits the per-user grant list for the "shared" level. Talks to the
 * visibility server actions directly; the entity must already exist.
 */
function GrantManager({ entity, disabled = false }: GrantManagerProps) {
  const t = useTranslations();
  const [grants, setGrants] = useState<GrantWithGrantee[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [capability, setCapability] = useState<Capability>("use");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    await safe(async () => {
      const result = await listGrantsAction({
        entityType: entity.type,
        entityId: entity.id,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    })
      .ifOk((rows) => setGrants(rows))
      .ifFail(handleErrorWithToast)
      .watch(() => setLoading(false));
  }, [entity.id, entity.type]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addGrant = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    await safe(async () => {
      const resolved = await resolveGranteeByEmailAction({
        entityType: entity.type,
        entityId: entity.id,
        email: trimmed,
      });
      if (!resolved.success) throw new Error(resolved.error);
      const grantee = resolved.data;
      if (!grantee) {
        throw new Error(t("Visibility.userNotFound", { email: trimmed }));
      }
      const granted = await grantAccessAction({
        entityType: entity.type,
        entityId: entity.id,
        granteeUserId: grantee.id,
        capability,
      });
      if (!granted.success) throw new Error(granted.error);
      return grantee;
    })
      .ifOk((grantee) => {
        setEmail("");
        toast.success(t("Visibility.grantAdded", { name: grantee.name }));
        void refresh();
      })
      .ifFail(handleErrorWithToast)
      .watch(() => setAdding(false));
  }, [capability, email, entity.id, entity.type, refresh, t]);

  const removeGrant = useCallback(
    async (grant: GrantWithGrantee) => {
      await safe(async () => {
        const result = await revokeAccessAction({
          entityType: entity.type,
          entityId: entity.id,
          granteeUserId: grant.granteeUserId,
          capability: grant.capability,
        });
        if (!result.success) throw new Error(result.error);
      })
        .ifOk(() => {
          toast.success(t("Visibility.grantRemoved"));
          void refresh();
        })
        .ifFail(handleErrorWithToast);
    },
    [entity.id, entity.type, refresh, t],
  );

  return (
    <div className="flex flex-col gap-2" data-testid="visibility-shared-panel">
      <Label className="text-xs text-muted-foreground">
        {t("Visibility.peopleLabel")}
      </Label>

      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={email}
          disabled={disabled || adding}
          placeholder={t("Visibility.emailPlaceholder")}
          className="rounded-full"
          data-testid="visibility-grant-email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addGrant();
            }
          }}
        />
        <Select
          value={capability}
          onValueChange={(v) => setCapability(v as Capability)}
          disabled={disabled || adding}
        >
          <SelectTrigger
            className="w-28 rounded-full"
            data-testid="visibility-grant-capability"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAPABILITIES.map((cap) => (
              <SelectItem key={cap} value={cap}>
                {t(`Visibility.capability.${cap}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          disabled={disabled || adding || email.trim().length === 0}
          onClick={() => void addGrant()}
          data-testid="visibility-grant-add"
          aria-label={t("Visibility.addPerson")}
        >
          {adding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">
          {t("Visibility.loading")}
        </p>
      ) : grants.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("Visibility.noGrants")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {grants.map((grant) => (
            <li
              key={`${grant.granteeUserId}:${grant.capability}`}
              className="flex items-center gap-2 rounded-xl border px-3 py-1.5"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">
                  {grant.granteeName ??
                    grant.granteeEmail ??
                    grant.granteeUserId}
                </span>
                {grant.granteeEmail && grant.granteeName && (
                  <span className="truncate text-xs text-muted-foreground">
                    {grant.granteeEmail}
                  </span>
                )}
              </span>
              <Badge variant="secondary" className="shrink-0">
                {t(`Visibility.capability.${grant.capability}`)}
              </Badge>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={disabled}
                onClick={() => void removeGrant(grant)}
                aria-label={t("Visibility.removeGrant")}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
