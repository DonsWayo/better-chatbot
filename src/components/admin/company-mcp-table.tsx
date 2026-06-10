"use client";

import {
  deleteCompanyMcpServerAction,
  registerCompanyMcpServerAction,
  updateCompanyMcpServerAction,
} from "@/app/api/admin/actions";
import type { MCPRemoteConfig } from "app-types/mcp";
import { format } from "date-fns";
import type { McpServerEntity } from "lib/db/pg/schema.pg";
import { cn } from "lib/utils";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plug2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";

interface CompanyMcpTableProps {
  servers: McpServerEntity[];
  teams?: { id: string; name: string }[];
}

export function CompanyMcpTable({
  servers: initialServers,
  teams = [],
}: CompanyMcpTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [servers, setServers] = useState(initialServers);

  // Register dialog state
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<"org" | "team">("org");
  const [newTeamIds, setNewTeamIds] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newOAuthClientId, setNewOAuthClientId] = useState("");
  const [newOAuthClientSecret, setNewOAuthClientSecret] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean;
    toolCount?: number;
    needsAuth?: boolean;
    error?: string;
  } | null>(null);

  const resetRegisterForm = () => {
    setNewName("");
    setNewUrl("");
    setNewScope("org");
    setNewTeamIds([]);
    setNewOAuthClientId("");
    setNewOAuthClientSecret("");
    setAdvancedOpen(false);
    setTeamPickerOpen(false);
    setRegisterError(null);
    setConnectionResult(null);
  };

  const handleRegisterDialogChange = (open: boolean) => {
    setShowRegister(open);
    if (!open) resetRegisterForm();
  };

  const toggleTeam = (teamId: string) => {
    setNewTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId],
    );
  };

  const handleRegister = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    if (newScope === "team" && newTeamIds.length === 0) {
      setRegisterError("Select at least one team for a team-scoped server.");
      return;
    }
    setIsRegistering(true);
    setRegisterError(null);
    setConnectionResult(null);
    try {
      const config: MCPRemoteConfig = { url: newUrl.trim() };
      if (newOAuthClientId.trim())
        config.oauthClientId = newOAuthClientId.trim();
      if (newOAuthClientSecret.trim())
        config.oauthClientSecret = newOAuthClientSecret.trim();

      const result = await registerCompanyMcpServerAction({
        name: newName.trim(),
        scope: newScope,
        teamIds: newScope === "team" ? newTeamIds : undefined,
        config,
        enabled: true,
      });
      setServers((prev) => [...prev, result.server]);
      setConnectionResult(result.connection);
      startTransition(() => {
        router.refresh();
      });
      // Auto-close on a clean connection; otherwise keep the dialog open so the
      // admin can read the connection feedback (the server is still saved).
      if (result.connection.ok) {
        setTimeout(() => {
          handleRegisterDialogChange(false);
        }, 1500);
      }
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleToggleEnabled = async (server: McpServerEntity) => {
    try {
      const updated = await updateCompanyMcpServerAction(server.id, {
        enabled: !server.enabled,
      });
      setServers((prev) => prev.map((s) => (s.id === server.id ? updated : s)));
    } catch {
      // silently fail — optimistic would be overkill for admin page
    }
  };

  const handleDelete = async (serverId: string) => {
    if (!confirm("Remove this MCP server from the registry?")) return;
    try {
      await deleteCompanyMcpServerAction(serverId);
      setServers((prev) => prev.filter((s) => s.id !== serverId));
    } catch {
      // silently fail
    }
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {servers.length} {servers.length === 1 ? "server" : "servers"}
        </div>
        <Button
          size="sm"
          onClick={() => setShowRegister(true)}
          data-testid="register-server-btn"
        >
          <Plug2 className="h-4 w-4 mr-1" />
          Register Server
        </Button>
      </div>

      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Scope</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Enabled</TableHead>
              <TableHead className="font-semibold">Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No company MCP servers registered yet
                </TableCell>
              </TableRow>
            ) : (
              servers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="rounded-full">
                      {server.scope === "org" ? "Org-wide" : "Team"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {server.lastConnectionStatus ? (
                      <Badge
                        variant="secondary"
                        className={
                          server.lastConnectionStatus === "connected"
                            ? "rounded-full border-transparent bg-green-500/15 text-green-600 dark:text-green-400"
                            : "rounded-full border-transparent bg-red-500/15 text-red-600 dark:text-red-400"
                        }
                      >
                        {server.lastConnectionStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(server)}
                      className="inline-flex items-center gap-1 text-sm"
                      data-testid={`toggle-server-${server.id}`}
                    >
                      {server.enabled ? (
                        <ToggleRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span
                        className={
                          server.enabled
                            ? "text-green-600 dark:text-green-400 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {server.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(server.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(server.id)}
                      aria-label="Remove server"
                      data-testid={`delete-server-${server.id}`}
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

      {/* Register Server dialog */}
      <Dialog open={showRegister} onOpenChange={handleRegisterDialogChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register a company MCP server</DialogTitle>
            <DialogDescription>
              Connect an approved MCP server so the people on the teams you pick
              can use its tools. We&apos;ll test the connection as soon as you
              add it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="new-server-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="new-server-name"
                placeholder="e.g. Company Jira"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="new-server-name"
              />
            </div>

            {/* URL */}
            <div className="space-y-1.5">
              <label htmlFor="new-server-url" className="text-sm font-medium">
                Server URL
              </label>
              <Input
                id="new-server-url"
                placeholder="https://mcp.example.com/sse"
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                data-testid="new-server-url"
              />
              <p className="text-xs text-muted-foreground">
                The remote SSE / streamable HTTP endpoint of the MCP server.
              </p>
            </div>

            {/* Scope */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Availability</label>
              <Select
                value={newScope}
                onValueChange={(v) => setNewScope(v as "org" | "team")}
              >
                <SelectTrigger data-testid="new-server-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Everyone in the org</SelectItem>
                  <SelectItem value="team">Specific teams</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Team multi-select */}
            {newScope === "team" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Teams</label>
                <Popover open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={teamPickerOpen}
                      className="w-full justify-between font-normal"
                      data-testid="new-server-teams"
                    >
                      <span className="flex items-center gap-2 truncate text-muted-foreground">
                        <Users className="h-4 w-4 shrink-0" />
                        {newTeamIds.length === 0
                          ? "Select teams…"
                          : `${newTeamIds.length} team${
                              newTeamIds.length === 1 ? "" : "s"
                            } selected`}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Search teams…" />
                      <CommandList>
                        <CommandEmpty>No teams found.</CommandEmpty>
                        <CommandGroup>
                          {teams.map((team) => {
                            const selected = newTeamIds.includes(team.id);
                            return (
                              <CommandItem
                                key={team.id}
                                value={team.name}
                                onSelect={() => toggleTeam(team.id)}
                                className="gap-2"
                              >
                                <Checkbox
                                  checked={selected}
                                  className="pointer-events-none"
                                  aria-hidden
                                />
                                <span className="flex-1 truncate">
                                  {team.name}
                                </span>
                                {selected && (
                                  <Check className="h-4 w-4 text-primary" />
                                )}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {newTeamIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {newTeamIds.map((id) => {
                      const team = teams.find((t) => t.id === id);
                      if (!team) return null;
                      return (
                        <Badge
                          key={id}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          {team.name}
                          <button
                            type="button"
                            onClick={() => toggleTeam(id)}
                            className="rounded-sm opacity-70 hover:opacity-100"
                            aria-label={`Remove ${team.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Advanced configuration */}
            <div className="rounded-lg border bg-card">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
                aria-expanded={advancedOpen}
                data-testid="advanced-config-toggle"
              >
                Advanced configuration
                {advancedOpen ? (
                  <ChevronUp className="h-4 w-4 opacity-60" />
                ) : (
                  <ChevronDown className="h-4 w-4 opacity-60" />
                )}
              </button>
              {advancedOpen && (
                <div className="space-y-4 border-t px-3 py-4">
                  <p className="text-xs text-muted-foreground">
                    Only connect to developer servers you trust.
                  </p>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="new-server-oauth-id"
                      className="text-sm font-medium"
                    >
                      OAuth Client ID{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </label>
                    <Input
                      id="new-server-oauth-id"
                      placeholder="client-id"
                      value={newOAuthClientId}
                      onChange={(e) => setNewOAuthClientId(e.target.value)}
                      data-testid="new-server-oauth-id"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="new-server-oauth-secret"
                      className="text-sm font-medium"
                    >
                      OAuth Client Secret{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </label>
                    <Input
                      id="new-server-oauth-secret"
                      type="password"
                      placeholder="••••••••"
                      value={newOAuthClientSecret}
                      onChange={(e) => setNewOAuthClientSecret(e.target.value)}
                      data-testid="new-server-oauth-secret"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Inline status area */}
            {registerError && (
              <p className="text-sm text-destructive" role="alert">
                {registerError}
              </p>
            )}
            {connectionResult && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-3 text-sm",
                  connectionResult.ok &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  connectionResult.needsAuth &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  !connectionResult.ok &&
                    !connectionResult.needsAuth &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                )}
                data-testid="connection-result"
              >
                {connectionResult.ok ? (
                  <>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Connected — {connectionResult.toolCount ?? 0}{" "}
                      {connectionResult.toolCount === 1 ? "tool" : "tools"}{" "}
                      available.
                    </span>
                  </>
                ) : connectionResult.needsAuth ? (
                  <>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Saved, but this server needs authorization before its
                      tools can be used. Connect it from the server list to
                      finish signing in.
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Saved, but the connection test failed
                      {connectionResult.error
                        ? `: ${connectionResult.error}`
                        : "."}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleRegisterDialogChange(false)}
              disabled={isRegistering}
            >
              {connectionResult ? "Done" : "Cancel"}
            </Button>
            <Button
              onClick={handleRegister}
              disabled={
                !newName.trim() ||
                !newUrl.trim() ||
                (newScope === "team" && newTeamIds.length === 0) ||
                isRegistering
              }
              data-testid="confirm-register-btn"
            >
              {isRegistering ? "Testing connection…" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
