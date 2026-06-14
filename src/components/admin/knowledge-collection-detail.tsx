"use client";

import { format } from "date-fns";
import type { AsafeKnowledgeCollectionEntity } from "lib/db/pg/schema.pg";
import { ArrowLeft, FileText, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { EmptyState } from "ui/empty-state";
import { Input } from "ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { Textarea } from "ui/textarea";

interface DocumentEntry {
  id: string;
  sourceRef: string;
  chunkCount: number;
  createdAt: string;
}

interface KnowledgeCollectionDetailProps {
  collection: AsafeKnowledgeCollectionEntity;
  initialDocuments: DocumentEntry[];
}

export function KnowledgeCollectionDetail({
  collection,
  initialDocuments,
}: KnowledgeCollectionDetailProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [documents, setDocuments] = useState(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<"text" | "file">("text");

  // Text ingest
  const [textContent, setTextContent] = useState("");
  const [textSourceRef, setTextSourceRef] = useState("");

  // File ingest
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState<string | null>(null);

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string);
    };
    reader.readAsText(file, "utf-8");
  };

  const resetUploadForm = () => {
    setTextContent("");
    setTextSourceRef("");
    setFileName("");
    setFileContent(null);
    setIngestError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleIngest = async () => {
    const isText = activeTab === "text";
    const text = isText ? textContent.trim() : (fileContent ?? "");
    const sourceRef = isText
      ? textSourceRef.trim() || "manual"
      : fileName || "upload";

    if (!text) return;

    setIsIngesting(true);
    setIngestError(null);
    try {
      const res = await fetch("/api/knowledge/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collectionId: collection.id,
          text,
          sourceRef,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Ingest failed");
      }
      const data = await res.json();
      setDocuments((prev) => {
        const existing = prev.findIndex((d) => d.sourceRef === sourceRef);
        const entry: DocumentEntry = {
          id: btoa(sourceRef)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, ""),
          sourceRef,
          chunkCount: data.chunks,
          createdAt: new Date().toISOString(),
        };
        if (existing >= 0) {
          return prev.map((d, i) => (i === existing ? entry : d));
        }
        return [entry, ...prev];
      });
      resetUploadForm();
      setShowUpload(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "Failed to ingest");
    } finally {
      setIsIngesting(false);
    }
  };

  const handleDelete = async (doc: DocumentEntry) => {
    if (!confirm(`Remove "${doc.sourceRef}" and all its chunks?`)) return;
    try {
      const res = await fetch(
        `/api/knowledge/collections/${collection.id}/documents/${doc.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Delete failed");
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete document",
      );
    }
  };

  const canIngest =
    activeTab === "text" ? textContent.trim().length > 0 : fileContent !== null;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
          <Link href="/admin/knowledge">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-xl font-semibold tracking-tight truncate">
              {collection.name}
            </h2>
            <Badge variant="secondary" className="rounded-full">
              {collection.visibility === "org" ? "Org-wide" : "Team only"}
            </Badge>
          </div>
          {collection.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {collection.description}
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setShowUpload(true)}
          data-testid="ingest-document-btn"
        >
          <Upload className="h-4 w-4 mr-1" />
          Ingest Document
        </Button>
      </div>

      {/* Document list */}
      <div className="rounded-lg border bg-card w-full overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-semibold">Source</TableHead>
              <TableHead className="font-semibold">Chunks</TableHead>
              <TableHead className="font-semibold">Ingested</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-4">
                  <EmptyState
                    icon={FileText}
                    title="No documents ingested yet"
                    description={'Click "Ingest Document" to add one.'}
                    compact
                  />
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate font-mono text-sm">
                        {doc.sourceRef}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline">{doc.chunkCount}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(doc.createdAt), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(doc)}
                      aria-label="Delete document"
                      data-testid={`delete-doc-${doc.id}`}
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

      {/* Ingest dialog */}
      <Dialog
        open={showUpload}
        onOpenChange={(v) => {
          setShowUpload(v);
          if (!v) resetUploadForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ingest Document</DialogTitle>
            <DialogDescription>
              Add text or a file to the <strong>{collection.name}</strong>{" "}
              collection. Existing chunks for the same source ref will be
              replaced.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "text" | "file")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="text" className="flex-1">
                Paste Text
              </TabsTrigger>
              <TabsTrigger value="file" className="flex-1">
                Upload File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Source label
                </label>
                <Input
                  placeholder="e.g. onboarding-guide-v2"
                  value={textSourceRef}
                  onChange={(e) => setTextSourceRef(e.target.value)}
                  data-testid="ingest-source-ref"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Content
                </label>
                <Textarea
                  placeholder="Paste document text here…"
                  rows={8}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="font-mono text-sm resize-none"
                  data-testid="ingest-text-content"
                />
              </div>
            </TabsContent>

            <TabsContent value="file" className="space-y-3 pt-2">
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    fileInputRef.current?.click();
                }}
                tabIndex={0}
                role="button"
                aria-label="Upload text file"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                {fileName ? (
                  <p className="text-sm font-medium">{fileName}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">Click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Plain text, Markdown, or any UTF-8 file
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.html"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="ingest-file-input"
              />
            </TabsContent>
          </Tabs>

          {ingestError && (
            <p className="text-sm text-destructive">{ingestError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUpload(false);
                resetUploadForm();
              }}
              disabled={isIngesting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleIngest}
              disabled={!canIngest || isIngesting}
              data-testid="confirm-ingest-btn"
            >
              {isIngesting ? "Ingesting…" : "Ingest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
