"use client";

import { format } from "date-fns";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Input } from "ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

import { createTeamAction } from "@/app/(chat)/(admin)/admin/teams/(list)/actions";
import { AdminTeamListItem } from "lib/admin/teams";

interface TeamsTableProps {
  teams: AdminTeamListItem[];
}

export function TeamsTable({ teams }: TeamsTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      // The action returns a structured result instead of throwing so the
      // admin-permission denial / slug-collision reason survives prod's
      // masked-500.
      const result = await createTeamAction(
        name.trim(),
        description.trim() || undefined,
      );
      if (!result.success) {
        toast.error(result.error || "Failed to create team");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {teams.length} {teams.length === 1 ? "team" : "teams"}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Team</DialogTitle>
              <DialogDescription>
                Add a new team. A URL-friendly slug will be generated
                automatically from the name.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="team-name">
                  Name
                </label>
                <Input
                  id="team-name"
                  placeholder="e.g. Engineering"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="team-description"
                >
                  Description{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <Input
                  id="team-description"
                  placeholder="What does this team work on?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || isSubmitting}
              >
                {isSubmitting ? "Creating…" : "Create Team"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Slug</TableHead>
              <TableHead className="font-semibold text-right">
                Members
              </TableHead>
              <TableHead className="font-semibold text-right">
                Budget Used / Total
              </TableHead>
              <TableHead className="font-semibold">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  No teams found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div>
                        <Link
                          href={`/admin/teams/${team.id}`}
                          className="font-medium hover:underline"
                        >
                          {team.name}
                        </Link>
                        {team.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {team.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {team.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1 text-sm tabular-nums">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {team.memberCount}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-right font-mono tabular-nums">
                    {team.budgetUsd != null ? (
                      <span>
                        <span className="font-medium">
                          ${Number(team.usedUsd ?? 0).toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          / ${Number(team.budgetUsd).toFixed(2)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(team.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
