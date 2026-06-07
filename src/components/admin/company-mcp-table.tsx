"use client";

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
import { Plug2 } from "lucide-react";
import type { McpServerEntity } from "lib/db/pg/schema.pg";

interface CompanyMcpTableProps {
  servers: McpServerEntity[];
}

export function CompanyMcpTable({ servers }: CompanyMcpTableProps) {
  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {servers.length} {servers.length === 1 ? "server" : "servers"}
        </div>
        <Button size="sm" disabled>
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
                    <Badge
                      variant={server.scope === "org" ? "default" : "secondary"}
                    >
                      {server.scope === "org" ? "Org-wide" : "Team"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {server.lastConnectionStatus ? (
                      <Badge
                        variant={
                          server.lastConnectionStatus === "connected"
                            ? "default"
                            : "destructive"
                        }
                      >
                        {server.lastConnectionStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={server.enabled ? "default" : "outline"}>
                      {server.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(server.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" disabled>
                      Edit
                    </Button>
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
