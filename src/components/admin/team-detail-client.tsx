"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Badge } from "ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";
import { ArrowLeft, Trash2, UserPlus, DollarSign, ShieldCheck, BarChart3, Settings } from "lucide-react";
import Link from "next/link";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  setBudgetAction,
  setModelAllowListAction,
  setEmailDomainsAction,
  setPolicyAction,
} from "@/app/(chat)/(admin)/admin/teams/[id]/actions";

type Role = "admin" | "editor" | "member";

interface Member {
  memberId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  userName: string | null;
  userEmail: string;
}

interface Budget {
  id: string;
  teamId: string;
  budgetUsd: string;
  usedUsd: string;
  periodStart: Date;
  periodEnd: Date;
}

const APPROVED_MODELS = [
  { id: "gpt-5.1", label: "GPT-5.1", note: "balanced" },
  { id: "claude-opus-4.8", label: "Claude Opus 4.8", note: "frontier" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "fast & multilingual" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", note: "cheapest" },
] as const;

interface UsageRow {
  model: string;
  provider: string;
  requests: number;
  totalCostUsd: string | null;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  members: Member[];
  budget: Budget | null;
  modelAllowList: string[];
  allowedEmailDomains: string[];
  guardrailPolicy: string;
  allowImageGen: boolean;
  allowVision: boolean;
  allowSpeech: boolean;
}

interface TeamDetailClientProps {
  team: Team;
}

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> =
  {
    admin: "default",
    editor: "secondary",
    member: "outline",
  };

export function TeamDetailClient({ team }: TeamDetailClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Add member form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Remove state
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Per-team usage state (fetched client-side to avoid blocking SSR)
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [usageTotals, setUsageTotals] = useState<{ totalRequests: number; totalCostUsd: string | null } | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/teams/${team.id}/usage?days=30`)
      .then((r) => r.json())
      .then((d) => {
        setUsageRows(d.byModel ?? []);
        setUsageTotals(d.totals ?? null);
      })
      .catch(() => {})
      .finally(() => setUsageLoading(false));
  }, [team.id]);

  // Team policy state (guardrail + feature toggles)
  const [guardrailPolicy, setGuardrailPolicy] = useState(team.guardrailPolicy ?? "standard");
  const [allowImageGen, setAllowImageGen] = useState(team.allowImageGen ?? false);
  const [allowVision, setAllowVision] = useState(team.allowVision ?? false);
  const [allowSpeech, setAllowSpeech] = useState(team.allowSpeech ?? false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySuccess, setPolicySuccess] = useState(false);

  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    setPolicyError(null);
    setPolicySuccess(false);
    try {
      await setPolicyAction(team.id, {
        guardrailPolicy: guardrailPolicy as "strict" | "standard" | "permissive",
        allowImageGen,
        allowVision,
        allowSpeech,
      });
      setPolicySuccess(true);
      startTransition(() => { router.refresh(); });
    } catch (err) {
      setPolicyError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // Email domain allow-list state
  const [emailDomains, setEmailDomains] = useState<string[]>(team.allowedEmailDomains ?? []);
  const [newDomain, setNewDomain] = useState("");
  const [isSavingDomains, setIsSavingDomains] = useState(false);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [domainsSuccess, setDomainsSuccess] = useState(false);

  const handleAddDomain = () => {
    const d = newDomain.trim().toLowerCase();
    if (!d || emailDomains.includes(d)) return;
    setEmailDomains([...emailDomains, d]);
    setNewDomain("");
  };

  const handleRemoveDomain = (d: string) => {
    setEmailDomains(emailDomains.filter((x) => x !== d));
  };

  const handleSaveDomains = async () => {
    setIsSavingDomains(true);
    setDomainsError(null);
    setDomainsSuccess(false);
    try {
      await setEmailDomainsAction(team.id, emailDomains);
      setDomainsSuccess(true);
      startTransition(() => { router.refresh(); });
    } catch (err) {
      setDomainsError(err instanceof Error ? err.message : "Failed to save domains");
    } finally {
      setIsSavingDomains(false);
    }
  };

  // Model allow-list state
  const [selectedModels, setSelectedModels] = useState<string[]>(team.modelAllowList ?? []);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsSuccess, setModelsSuccess] = useState(false);

  const handleToggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId],
    );
  };

  const handleSaveModels = async () => {
    setIsSavingModels(true);
    setModelsError(null);
    setModelsSuccess(false);
    try {
      await setModelAllowListAction(team.id, selectedModels);
      setModelsSuccess(true);
      startTransition(() => { router.refresh(); });
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "Failed to save model list");
    } finally {
      setIsSavingModels(false);
    }
  };

  // Budget form state
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [budgetUsd, setBudgetUsd] = useState(
    team.budget?.budgetUsd ?? "",
  );
  const [periodStart, setPeriodStart] = useState(
    team.budget
      ? new Date(team.budget.periodStart).toISOString().slice(0, 10)
      : today,
  );
  const [periodEnd, setPeriodEnd] = useState(
    team.budget
      ? new Date(team.budget.periodEnd).toISOString().slice(0, 10)
      : thirtyDaysOut,
  );
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetSuccess, setBudgetSuccess] = useState(false);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addTeamMemberAction(team.id, email.trim(), role);
      setEmail("");
      setRole("member");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    setRemovingId(memberId);
    try {
      await removeTeamMemberAction(memberId, team.id);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setRemovingId(null);
    }
  };

  const handleSaveBudget = async () => {
    if (!budgetUsd.trim() || !periodStart || !periodEnd) return;
    setIsSavingBudget(true);
    setBudgetError(null);
    setBudgetSuccess(false);
    try {
      await setBudgetAction(team.id, budgetUsd.trim(), periodStart, periodEnd);
      setBudgetSuccess(true);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setBudgetError(
        err instanceof Error ? err.message : "Failed to save budget",
      );
    } finally {
      setIsSavingBudget(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Back link */}
      <div>
        <Link
          href="/admin/teams"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Teams
        </Link>
      </div>

      {/* Team header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
            {team.slug}
          </code>
          {team.description && <span>{team.description}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Created {format(new Date(team.createdAt), "MMM d, yyyy")}
        </p>
      </div>

      {/* Usage summary (last 30 days) */}
      <Card data-testid="team-usage-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {usageLoading ? (
            <p className="text-sm text-muted-foreground italic">Loading…</p>
          ) : usageTotals && usageTotals.totalRequests > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-lg font-bold">{usageTotals.totalRequests.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="text-lg font-bold">
                    ${Number(usageTotals.totalCostUsd ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
              {usageRows.length > 0 && (
                <div className="rounded-md border divide-y text-sm">
                  {usageRows.map((r, i) => (
                    <div key={`${r.model}-${i}`} className="flex items-center justify-between px-3 py-1.5">
                      <code className="text-xs">{r.model}</code>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground mr-2">{r.requests.toLocaleString()} req</span>
                        <span className="text-xs font-mono">${Number(r.totalCostUsd ?? 0).toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No usage data for this team in the last 30 days.</p>
          )}
        </CardContent>
      </Card>

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Members ({team.members.length})
          </CardTitle>
          <CardDescription>
            Manage who has access to this team and their roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-b-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold pl-6">Name</TableHead>
                  <TableHead className="font-semibold">Email</TableHead>
                  <TableHead className="font-semibold">Role</TableHead>
                  <TableHead className="font-semibold">Joined</TableHead>
                  <TableHead className="font-semibold pr-6 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.members.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground pl-6"
                    >
                      No members yet. Add one below.
                    </TableCell>
                  </TableRow>
                ) : (
                  team.members.map((m) => (
                    <TableRow key={m.memberId}>
                      <TableCell className="pl-6">
                        <span className="font-medium">
                          {m.userName ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{m.userEmail}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ROLE_BADGE_VARIANT[m.role] ?? "outline"
                          }
                          className="capitalize text-xs"
                        >
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(m.joinedAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={removingId === m.memberId}
                          onClick={() => handleRemove(m.memberId)}
                          aria-label="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add member form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add Member
          </CardTitle>
          <CardDescription>
            Add a user to this team by their email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="user@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              className="flex-1"
              disabled={isAdding}
            />
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              disabled={isAdding}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleAdd}
              disabled={!email.trim() || isAdding}
              className="shrink-0"
            >
              {isAdding ? "Adding…" : "Add"}
            </Button>
          </div>
          {addError && (
            <p className="mt-2 text-sm text-destructive">{addError}</p>
          )}
        </CardContent>
      </Card>

      {/* Model allow-list */}
      <Card data-testid="model-allow-list-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Model Allow-List
          </CardTitle>
          <CardDescription>
            Restrict this team to specific models. Empty selection = all approved models allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {APPROVED_MODELS.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 cursor-pointer rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors"
                data-testid={`model-checkbox-${m.id}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selectedModels.includes(m.id)}
                  onChange={() => handleToggleModel(m.id)}
                  disabled={isSavingModels}
                />
                <span className="flex-1 text-sm font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.note}</span>
              </label>
            ))}
          </div>
          {selectedModels.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No restrictions — all approved models are available to this team.
            </p>
          )}
          <Button
            onClick={handleSaveModels}
            disabled={isSavingModels}
            className="w-full sm:w-auto"
            data-testid="save-model-allow-list-btn"
          >
            {isSavingModels ? "Saving…" : "Save Model List"}
          </Button>
          {modelsError && <p className="text-sm text-destructive">{modelsError}</p>}
          {modelsSuccess && <p className="text-sm text-green-600">Model list saved.</p>}
        </CardContent>
      </Card>

      {/* Guardrail policy + feature toggles */}
      <Card data-testid="policy-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Team Policy
          </CardTitle>
          <CardDescription>
            Configure guardrail strictness and which AI capabilities are enabled for this team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Guardrail Policy
            </label>
            <Select
              value={guardrailPolicy}
              onValueChange={(v) => setGuardrailPolicy(v)}
              disabled={isSavingPolicy}
            >
              <SelectTrigger className="w-full sm:w-56" data-testid="guardrail-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict — block sensitive topics</SelectItem>
                <SelectItem value="standard">Standard — balanced filtering</SelectItem>
                <SelectItem value="permissive">Permissive — minimal filtering</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Feature Toggles
            </p>
            {(
              [
                { key: "allowImageGen", label: "Image generation", value: allowImageGen, set: setAllowImageGen },
                { key: "allowVision",   label: "Vision (image input)", value: allowVision, set: setAllowVision },
                { key: "allowSpeech",  label: "Speech / audio", value: allowSpeech, set: setAllowSpeech },
              ] as const
            ).map(({ key, label, value, set }) => (
              <label
                key={key}
                className="flex items-center gap-3 cursor-pointer rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors"
                data-testid={`toggle-${key}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  disabled={isSavingPolicy}
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          <Button
            onClick={handleSavePolicy}
            disabled={isSavingPolicy}
            className="w-full sm:w-auto"
            data-testid="save-policy-btn"
          >
            {isSavingPolicy ? "Saving…" : "Save Policy"}
          </Button>
          {policyError && <p className="text-sm text-destructive">{policyError}</p>}
          {policySuccess && <p className="text-sm text-green-600">Policy saved.</p>}
        </CardContent>
      </Card>

      {/* Email domain allow-list */}
      <Card data-testid="email-domains-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Email Domain Allow-List
          </CardTitle>
          <CardDescription>
            Restrict membership to users with specific email domains. Empty = any domain allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current domain chips */}
          {emailDomains.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {emailDomains.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-mono"
                  data-testid={`domain-chip-${d}`}
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => handleRemoveDomain(d)}
                    disabled={isSavingDomains}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                    aria-label={`Remove domain ${d}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No domain restrictions — any email domain can be added as a member.
            </p>
          )}

          {/* Add domain input */}
          <div className="flex gap-2">
            <Input
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddDomain(); }}
              className="flex-1"
              disabled={isSavingDomains}
              data-testid="domain-input"
            />
            <Button
              variant="outline"
              onClick={handleAddDomain}
              disabled={!newDomain.trim() || isSavingDomains}
              data-testid="add-domain-btn"
            >
              Add
            </Button>
          </div>

          <Button
            onClick={handleSaveDomains}
            disabled={isSavingDomains}
            className="w-full sm:w-auto"
            data-testid="save-domains-btn"
          >
            {isSavingDomains ? "Saving…" : "Save Domains"}
          </Button>
          {domainsError && <p className="text-sm text-destructive">{domainsError}</p>}
          {domainsSuccess && <p className="text-sm text-green-600">Domain list saved.</p>}
        </CardContent>
      </Card>

      {/* Budget section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Budget
          </CardTitle>
          <CardDescription>
            Set or update the spending budget for this team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current budget summary */}
          {team.budget ? (
            <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current budget</span>
                <span className="font-medium">
                  ${parseFloat(team.budget.budgetUsd).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Used</span>
                <span>
                  ${parseFloat(team.budget.usedUsd).toFixed(4)}
                  {" "}
                  <span className="text-muted-foreground text-xs">
                    ({Math.min(
                      100,
                      Math.round(
                        (parseFloat(team.budget.usedUsd) /
                          parseFloat(team.budget.budgetUsd)) *
                          100,
                      ),
                    )}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Period</span>
                <span className="text-xs">
                  {format(new Date(team.budget.periodStart), "MMM d, yyyy")}
                  {" — "}
                  {format(new Date(team.budget.periodEnd), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active budget set for this team.
            </p>
          )}

          {/* Budget form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Budget (USD)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="100.00"
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(e.target.value)}
                disabled={isSavingBudget}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Period start
              </label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={isSavingBudget}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Period end
              </label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={isSavingBudget}
              />
            </div>
          </div>

          <Button
            onClick={handleSaveBudget}
            disabled={!budgetUsd.trim() || !periodStart || !periodEnd || isSavingBudget}
            className="w-full sm:w-auto"
          >
            {isSavingBudget ? "Saving…" : "Save Budget"}
          </Button>

          {budgetError && (
            <p className="text-sm text-destructive">{budgetError}</p>
          )}
          {budgetSuccess && (
            <p className="text-sm text-green-600">Budget saved successfully.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
