"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Plus, Search, BookOpen } from "lucide-react";

interface PromptTemplate {
  id: string;
  title: string;
  description: string | null;
  content: string;
  category: string | null;
  visibility: "private" | "team" | "org";
  isFeatured: boolean;
  usageCount: number;
  authorId: string | null;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NewPromptForm {
  title: string;
  description: string;
  content: string;
  category: string;
  visibility: "private" | "team" | "org";
}

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Private",
  team: "Team",
  org: "Org-wide",
};

const VISIBILITY_COLORS: Record<string, string> = {
  private: "secondary",
  team: "outline",
  org: "default",
} as const;

export interface PromptLibraryProps {
  onUse: (content: string) => void;
}

export function PromptLibrary({ onUse }: PromptLibraryProps) {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<NewPromptForm>({
    title: "",
    description: "",
    content: "",
    category: "",
    visibility: "private",
  });

  useEffect(() => {
    fetchPrompts();
  }, []);

  async function fetchPrompts() {
    setLoading(true);
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) {
        const data = await res.json() as PromptTemplate[];
        setPrompts(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          content: form.content.trim(),
          category: form.category.trim() || undefined,
          visibility: form.visibility,
        }),
      });
      if (res.ok) {
        const created = await res.json() as PromptTemplate;
        setPrompts((prev) => [created, ...prev]);
        setDialogOpen(false);
        setForm({ title: "", description: "", content: "", category: "", visibility: "private" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUse(prompt: PromptTemplate) {
    // Increment usage count in the background
    fetch(`/api/prompts/${prompt.id}/use`, { method: "POST" }).catch(() => {});
    setPrompts((prev) =>
      prev.map((p) => (p.id === prompt.id ? { ...p, usageCount: p.usageCount + 1 } : p)),
    );
    onUse(prompt.content);
  }

  const filtered = prompts.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          New Prompt
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading prompts…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <BookOpen className="h-8 w-8 opacity-40" />
          <p className="text-sm">
            {search ? "No prompts match your search." : "No prompts yet. Create your first one!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((prompt) => (
            <Card key={prompt.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-snug line-clamp-2">
                    {prompt.title}
                  </CardTitle>
                  {prompt.isFeatured && (
                    <Badge variant="default" className="shrink-0 text-xs">Featured</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge
                    variant={
                      (VISIBILITY_COLORS[prompt.visibility] ?? "secondary") as
                        | "default"
                        | "secondary"
                        | "outline"
                        | "destructive"
                    }
                    className="text-xs"
                  >
                    {VISIBILITY_LABELS[prompt.visibility] ?? prompt.visibility}
                  </Badge>
                  {prompt.category && (
                    <Badge variant="outline" className="text-xs">
                      {prompt.category}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 flex-1">
                {prompt.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {prompt.description}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Used {prompt.usageCount} {prompt.usageCount === 1 ? "time" : "times"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUse(prompt)}
                  >
                    Use
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New prompt dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Prompt Template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt-title">Title *</Label>
              <Input
                id="prompt-title"
                placeholder="e.g. Summarise meeting notes"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt-description">Description</Label>
              <Input
                id="prompt-description"
                placeholder="Short description (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt-content">Prompt *</Label>
              <Textarea
                id="prompt-content"
                placeholder="Write your prompt here…"
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="prompt-category">Category</Label>
                <Input
                  id="prompt-category"
                  placeholder="e.g. Writing, Analysis"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5 w-36">
                <Label>Visibility</Label>
                <Select
                  value={form.visibility}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, visibility: v as "private" | "team" | "org" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="org">Org-wide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !form.title.trim() || !form.content.trim()}
            >
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
