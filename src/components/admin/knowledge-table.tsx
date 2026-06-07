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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Plus } from "lucide-react";

import type { AsafeKnowledgeCollectionEntity } from "@/lib/db/pg/schema.pg";

interface KnowledgeTableProps {
  collections: AsafeKnowledgeCollectionEntity[];
}

export function KnowledgeTable({ collections }: KnowledgeTableProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"org" | "team">("org");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/knowledge/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          visibility,
        }),
      });
      if (res.ok) {
        setOpen(false);
        setName("");
        setDescription("");
        setVisibility("org");
        startTransition(() => {
          router.refresh();
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {collections.length}{" "}
          {collections.length === 1 ? "collection" : "collections"}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Collection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Knowledge Collection</DialogTitle>
              <DialogDescription>
                Add a new knowledge collection. Documents can be ingested via
                the{" "}
                <code className="text-xs bg-muted px-1 rounded">
                  POST /api/knowledge/ingest
                </code>{" "}
                API endpoint.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="collection-name">
                  Collection Name
                </label>
                <Input
                  id="collection-name"
                  placeholder="e.g. Product Documentation"
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
                  htmlFor="collection-description"
                >
                  Description{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <Input
                  id="collection-description"
                  placeholder="What does this collection contain?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="collection-visibility">
                  Visibility
                </label>
                <select
                  id="collection-visibility"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as "org" | "team")}
                >
                  <option value="org">Org-wide</option>
                  <option value="team">Team only</option>
                </select>
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
                {isSubmitting ? "Creating…" : "Create Collection"}
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
              <TableHead className="font-semibold">Visibility</TableHead>
              <TableHead className="font-semibold">Team</TableHead>
              <TableHead className="font-semibold">Created At</TableHead>
              <TableHead className="font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  No knowledge collections yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              collections.map((collection) => (
                <TableRow key={collection.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{collection.name}</div>
                      {collection.description && (
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {collection.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize text-sm">
                      {collection.visibility === "org" ? "Org-wide" : "Team only"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {collection.teamId ? (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {collection.teamId}
                      </code>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(collection.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      Ingest via{" "}
                      <code className="bg-muted px-1 rounded">
                        POST /api/knowledge/ingest
                      </code>
                    </span>
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
