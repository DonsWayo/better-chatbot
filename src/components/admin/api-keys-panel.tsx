"use client";

import {
  type ApiKeyListItem,
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/app/(chat)/(admin)/admin/api-keys/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, KeyRound, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

interface TeamOption {
  id: string;
  name: string;
}

const NO_TEAM = "__none__";

export function ApiKeysPanel({
  initialKeys,
  teams,
}: {
  initialKeys: ApiKeyListItem[];
  teams: TeamOption[];
}) {
  const [keys, setKeys] = useState<ApiKeyListItem[]>(initialKeys);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string>(NO_TEAM);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onCreate = () => {
    if (!name.trim()) {
      toast.error("Enter a key name");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createApiKeyAction({
          name: name.trim(),
          teamId: teamId === NO_TEAM ? null : teamId,
        });
        setNewSecret(result.plaintext);
        setName("");
        setTeamId(NO_TEAM);
        // Prepend the new row directly. The create action deliberately does NOT
        // revalidatePath (that would remount this panel and wipe `newSecret`
        // before the one-time reveal box paints), so this client update is the
        // source of truth until the next navigation/refresh reconciles the list.
        setKeys((prev) => [
          {
            id: result.id,
            name: result.name,
            keyPrefix: result.keyPrefix,
            teamId: null,
            scopes: ["*"],
            lastUsedAt: null,
            expiresAt: null,
            revokedAt: null,
            createdAt: new Date(),
          },
          ...prev,
        ]);
        toast.success("API key created — copy it now, it won't be shown again");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create key");
      }
    });
  };

  const onRevoke = (id: string) => {
    startTransition(async () => {
      try {
        await revokeApiKeyAction(id);
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date() } : k)),
        );
        toast.success("Key revoked");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to revoke key");
      }
    });
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Create API key
          </CardTitle>
          <CardDescription>
            Programmatic access to the public <code>/api/v1</code> surface. The
            key acts as your identity for entitlement, budget, and ownership.
            API keys skip the interactive AUP modal but remain subject to
            budget, model allow-list, guardrails, and visibility checks. The
            plaintext secret is shown once and never stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                placeholder="ci-pipeline, erp-trigger, ..."
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-56">
              <Label>Team scope</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Creator's primary team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>
                    Creator&apos;s primary team
                  </SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={onCreate} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create"}
            </Button>
          </div>

          {newSecret && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="mb-2 text-sm font-medium">
                Copy this secret now — it will never be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                  {newSecret}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copy(newSecret)}
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Dismiss"
                  onClick={() => setNewSecret(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            {keys.length} key{keys.length === 1 ? "" : "s"} issued
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No API keys yet.
                  </TableCell>
                </TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <code className="text-xs">{k.keyPrefix}…</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleString()
                      : "never"}
                  </TableCell>
                  <TableCell>
                    {k.revokedAt ? (
                      <Badge variant="destructive">revoked</Badge>
                    ) : (
                      <Badge variant="secondary">active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!k.revokedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onRevoke(k.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
