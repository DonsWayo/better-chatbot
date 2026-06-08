"use client";

import { useState, useTransition } from "react";
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
import { ArrowLeft, Trash2, UserPlus, DollarSign } from "lucide-react";
import Link from "next/link";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  setBudgetAction,
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

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  members: Member[];
  budget: Budget | null;
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
