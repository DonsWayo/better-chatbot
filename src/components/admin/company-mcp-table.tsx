"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  registerCompanyMcpServerAction,
  updateCompanyMcpServerAction,
  deleteCompanyMcpServerAction,
} from "@/app/api/admin/actions";
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
import { Badge } from "ui/badge";
import { Input } from "ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Card, CardContent } from "ui/card";
import { Plug2, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import type { McpServerEntity } from "lib/db/pg/schema.pg";

interface CompanyMcpTableProps {
  servers: McpServerEntity[];
}

export function CompanyMcpTable({ servers: initialServers }: CompanyMcpTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [servers, setServers] = useState(initialServers);

  // Register dialog state
  const [showRegister, setShowRegister] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<"org" | "team">("org");
  const [newUrl, setNewUrl] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setIsRegistering(true);
    setRegisterError(null);
    try {
      const server = await registerCompanyMcpServerAction({
        name: newName.trim(),
        scope: newScope,
        config: { url: newUrl.trim() } as never,
        enabled: true,
      });
      setServers((prev) => [...prev, server]);
      setNewName(""); setNewUrl(""); setNewScope("org");
      setShowRegister(false);
      startTransition(() => { router.refresh(); });
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleToggleEnabled = async (server: McpServerEntity) => {
    try {
      const updated = await updateCompanyMcpServerAction(server.id, { enabled: !server.enabled });
      setServers((prev) => prev.map((s) => s.id === server.id ? updated : s));
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
        <Button size="sm" onClick={() => setShowRegister(true)} data-testid="register-server-btn">
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
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No company MCP servers registered yet
                </TableCell>
              </TableRow>
            ) : (
              servers.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell>
                    <Badge variant={server.scope === "org" ? "default" : "secondary"}>
                      {server.scope === "org" ? "Org-wide" : "Team"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {server.lastConnectionStatus ? (
                      <Badge variant={server.lastConnectionStatus === "connected" ? "default" : "destructive"}>
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
                        <ToggleRight className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className={server.enabled ? "text-primary font-medium" : "text-muted-foreground"}>
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
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Company MCP Server</DialogTitle>
            <DialogDescription>
              Add an approved MCP server to the company catalog. Employees on authorised teams will be able to use its tools.
            </DialogDescription>
          </DialogHeader>

          <Card>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Name
                </label>
                <Input
                  placeholder="e.g. Company Jira"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="new-server-name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  URL (SSE endpoint)
                </label>
                <Input
                  placeholder="https://mcp.example.com/sse"
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  data-testid="new-server-url"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Scope
                </label>
                <Select value={newScope} onValueChange={(v) => setNewScope(v as "org" | "team")}>
                  <SelectTrigger data-testid="new-server-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org">Org-wide (all teams)</SelectItem>
                    <SelectItem value="team">Team-specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {registerError && <p className="text-sm text-destructive">{registerError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegister(false)} disabled={isRegistering}>
              Cancel
            </Button>
            <Button
              onClick={handleRegister}
              disabled={!newName.trim() || !newUrl.trim() || isRegistering}
              data-testid="confirm-register-btn"
            >
              {isRegistering ? "Registering…" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
