"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import type { DocumentCommentWithUser } from "lib/db/pg/repositories/document-comment-repository.pg";
import type {
  DocumentEntity,
  DocumentRevisionEntity,
  DocumentSummary,
} from "lib/db/pg/repositories/document-repository.pg";
import { AsafeDocumentTable } from "lib/db/pg/schema.pg";
import {
  documentCommentRepository,
  documentRepository,
  mentionNotificationRepository,
} from "lib/db/repository";
import { getIsUserAdmin } from "lib/user/utils";

/**
 * Server actions for the collaborative-document feature. These are the seams
 * the (separate) editor UI consumes — autosave calls updateDocumentAction; the
 * sharing UI calls setDocumentVisibilityAction; version history calls
 * saveDocumentVersionAction / restoreDocumentVersionAction.
 *
 * Documents are personal/collaborative content like chat threads, so ANY
 * authenticated user may create + edit their OWN docs (creation is NOT gated
 * behind editor/admin). Read/edit of someone else's doc flows through the
 * unified visibility model via documentRepository.checkAccess.
 *
 * The exported actions return a structured {@link ActionResult} instead of
 * throwing: production Next.js masks errors thrown from a Server Action into an
 * opaque 500 ("digest"), so user-instructional messages ("Forbidden", "Title
 * is required", ...) would never reach the client toast. Internal `*OrThrow`
 * helpers keep the throwing logic.
 */

// Guard against absurd payloads (a serialized ProseMirror doc this large is a
// bug or abuse, not a real document). ~4 MB of JSON.
const MAX_CONTENT_BYTES = 4_000_000;

// Rate-limit: cap research-to-document saves to prevent runaway doc creation.
// A genuine power user writing research all day rarely exceeds this in any
// single rolling hour.
const RESEARCH_SAVE_LIMIT_PER_HOUR = 20;

async function assertResearchSaveRateLimit(userId: string): Promise<void> {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(AsafeDocumentTable)
    .where(
      and(
        eq(AsafeDocumentTable.userId, userId),
        gte(AsafeDocumentTable.createdAt, windowStart),
      ),
    );
  const count = row?.count ?? 0;
  if (count >= RESEARCH_SAVE_LIMIT_PER_HOUR) {
    throw new Error(
      `You have saved ${RESEARCH_SAVE_LIMIT_PER_HOUR} documents in the last hour. Please wait before saving more.`,
    );
  }
}

async function requireUserId(): Promise<string> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

function assertSaneContent(content: unknown): void {
  if (content === undefined) return;
  let size = 0;
  try {
    size = JSON.stringify(content).length;
  } catch {
    throw new Error("Invalid document content");
  }
  if (size > MAX_CONTENT_BYTES) {
    throw new Error("Document is too large to save");
  }
}

// ── create ───────────────────────────────────────────────────────────────────

// Inline text → array of TipTap text/mark nodes.
// Handles: **bold**, *italic*, `inline code`, and plain text.
// Adjacent runs of different mark types are split into separate text nodes.
type TextNode = { type: "text"; text: string; marks?: { type: string }[] };

function parseInline(src: string): TextNode[] {
  const result: TextNode[] = [];
  // Matches bold (**…**), italic (*…*), or inline code (`…`) — in that order
  // so **bold** is not misread as two italic fragments.
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(src)) !== null) {
    if (match.index > last) {
      result.push({ type: "text", text: src.slice(last, match.index) });
    }
    if (match[1] !== undefined) {
      result.push({
        type: "text",
        text: match[1],
        marks: [{ type: "bold" }],
      });
    } else if (match[2] !== undefined) {
      result.push({
        type: "text",
        text: match[2],
        marks: [{ type: "italic" }],
      });
    } else if (match[3] !== undefined) {
      result.push({
        type: "text",
        text: match[3],
        marks: [{ type: "code" }],
      });
    }
    last = match.index + match[0].length;
  }
  if (last < src.length) {
    result.push({ type: "text", text: src.slice(last) });
  }
  return result;
}

// Determine the list-indent depth from leading whitespace.
// 2 spaces = 1 level; tabs = 1 level each.
function indentDepth(raw: string): number {
  const leading = raw.match(/^(\s*)/)?.[1] ?? "";
  let spaces = 0;
  for (const ch of leading) {
    if (ch === "\t") spaces += 2;
    else spaces++;
  }
  return Math.floor(spaces / 2);
}

// Build a nested bulletList / orderedList tree from a flat run of list items.
// Items with depth > `depth` are treated as children of the preceding item.
type RawListItem = { depth: number; text: string; ordered: boolean };

function buildListNode(
  items: RawListItem[],
  depth: number,
  ordered: boolean,
): Record<string, unknown> {
  const listItems: Record<string, unknown>[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.depth !== depth) {
      // Deeper items — already consumed as children; shallower = shouldn't happen
      i++;
      continue;
    }
    // Collect consecutive deeper items that belong to this item's children
    const children: RawListItem[] = [];
    let j = i + 1;
    while (j < items.length && items[j].depth > depth) {
      children.push(items[j]);
      j++;
    }

    const listItemContent: Record<string, unknown>[] = [
      { type: "paragraph", content: parseInline(item.text) },
    ];
    if (children.length > 0) {
      listItemContent.push(
        buildListNode(children, depth + 1, children[0].ordered),
      );
    }
    listItems.push({ type: "listItem", content: listItemContent });
    i = j;
  }
  return { type: ordered ? "orderedList" : "bulletList", content: listItems };
}

function textToProseMirrorDoc(text: string): Record<string, unknown> {
  // Guard: empty / whitespace-only input → minimal valid doc
  if (!text || !text.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const nodes: Record<string, unknown>[] = [];
  const lines = text.split("\n");
  let i = 0;

  // Pending list-item accumulator; flushed whenever we hit a non-list line.
  const pendingList: RawListItem[] = [];

  function flushList(): void {
    if (pendingList.length === 0) return;
    nodes.push(buildListNode(pendingList, 0, pendingList[0].ordered));
    pendingList.length = 0;
  }

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // ── Fenced code block ─────────────────────────────────────────────────
    const fenceOpen = raw.match(/^(\s*)```([\w-]*)\s*$/);
    if (fenceOpen) {
      flushList();
      const lang = fenceOpen[2] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume the closing ```
      const code = codeLines.join("\n");
      nodes.push({
        type: "codeBlock",
        attrs: { language: lang || null },
        content: code ? [{ type: "text", text: code }] : [],
      });
      continue;
    }

    // ── Blank line → flush pending list; skip the blank ───────────────────
    if (!trimmed) {
      flushList();
      i++;
      continue;
    }

    // ── ATX heading ───────────────────────────────────────────────────────
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      nodes.push({
        type: "heading",
        attrs: { level },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // ── Blockquote ────────────────────────────────────────────────────────
    if (/^(\s*)>\s?/.test(raw)) {
      flushList();
      const bqLines: string[] = [raw.replace(/^(\s*)>\s?/, "")];
      i++;
      while (i < lines.length && /^(\s*)>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^(\s*)>\s?/, ""));
        i++;
      }
      const bqContent = bqLines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => ({ type: "paragraph", content: parseInline(l) }));
      nodes.push({
        type: "blockquote",
        content: bqContent.length ? bqContent : [{ type: "paragraph" }],
      });
      continue;
    }

    // ── Unordered list item ───────────────────────────────────────────────
    const bulletMatch = raw.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bulletMatch) {
      const depth = indentDepth(raw);
      // Flush if the top-level type switches (bullet→ordered)
      if (pendingList.length > 0 && depth === 0 && pendingList[0].ordered) {
        flushList();
      }
      pendingList.push({ depth, text: bulletMatch[2], ordered: false });
      i++;
      continue;
    }

    // ── Ordered list item ─────────────────────────────────────────────────
    const orderedMatch = raw.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      const depth = indentDepth(raw);
      // Flush if the top-level type switches (ordered→bullet)
      if (pendingList.length > 0 && depth === 0 && !pendingList[0].ordered) {
        flushList();
      }
      pendingList.push({ depth, text: orderedMatch[2], ordered: true });
      i++;
      continue;
    }

    // ── Plain paragraph ───────────────────────────────────────────────────
    flushList();
    nodes.push({ type: "paragraph", content: parseInline(trimmed) });
    i++;
  }

  // Flush any trailing list
  flushList();

  return {
    type: "doc",
    content: nodes.length ? nodes : [{ type: "paragraph" }],
  };
}

export async function saveResearchAsDocumentAction(
  title: string,
  text: string,
): Promise<ActionResult<{ id: string; url: string }>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    await assertResearchSaveRateLimit(userId);
    const doc = await documentRepository.createDocument({ userId, title });
    const content = textToProseMirrorDoc(text);
    try {
      assertSaneContent(content);
      await documentRepository.updateDocument(
        doc.id,
        { title, content },
        userId,
      );
    } catch (err) {
      // Clean up the empty orphaned document before re-throwing
      await documentRepository.deleteDocument(doc.id, userId).catch(() => {});
      throw err;
    }
    return { id: doc.id, url: `/documents/${doc.id}` };
  });
}

export async function createDocumentAction(input?: {
  title?: string;
  teamId?: string | null;
  visibility?: "private" | "shared" | "team" | "company";
}): Promise<ActionResult<DocumentEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return documentRepository.createDocument({
      userId,
      title: input?.title,
      teamId: input?.teamId ?? null,
      visibility: input?.visibility,
    });
  });
}

// ── read ─────────────────────────────────────────────────────────────────────

export async function getDocumentAction(
  id: string,
): Promise<ActionResult<DocumentEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    if (!(await documentRepository.checkAccess(id, userId, true))) {
      throw new Error("Forbidden");
    }
    const doc = await documentRepository.getDocumentById(id);
    if (!doc) throw new Error("Document not found");
    return doc;
  });
}

export async function listDocumentsAction(): Promise<
  ActionResult<DocumentSummary[]>
> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return documentRepository.listDocumentsForUser(userId);
  });
}

// ── update / autosave ──────────────────────────────────────────────────────

export async function updateDocumentAction(
  id: string,
  // `content` is a JSON STRING of the ProseMirror doc, not a raw object: the
  // Server-Action argument encoder corrupts nested `attrs` objects (heading
  // level, link href) into a "$T" placeholder. A string round-trips intact.
  patch: { title?: string; content?: string },
): Promise<ActionResult<DocumentEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    let content: Record<string, unknown> | undefined;
    if (patch.content !== undefined) {
      try {
        content = JSON.parse(patch.content) as Record<string, unknown>;
      } catch {
        throw new Error("Invalid document content");
      }
      assertSaneContent(content);
    }
    // checkAccess(manage/edit) is enforced inside the repository mutation.
    return documentRepository.updateDocument(
      id,
      { title: patch.title, content },
      userId,
    );
  });
}

export async function renameDocumentAction(
  id: string,
  title: string,
): Promise<ActionResult<DocumentEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    if (!title.trim()) throw new Error("Title is required");
    return documentRepository.renameDocument(id, title, userId);
  });
}

// ── visibility / sharing ─────────────────────────────────────────────────────

export async function setDocumentVisibilityAction(
  id: string,
  visibility: "private" | "shared" | "team" | "company",
  teamId?: string | null,
): Promise<ActionResult<DocumentEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return documentRepository.setVisibility(id, visibility, userId, teamId);
  });
}

// ── delete ───────────────────────────────────────────────────────────────────

export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    await documentRepository.deleteDocument(id, userId);
  });
}

// ── version history ──────────────────────────────────────────────────────────

export async function saveDocumentVersionAction(
  id: string,
): Promise<ActionResult<DocumentRevisionEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return documentRepository.createRevision(id, userId);
  });
}

export async function listDocumentVersionsAction(
  id: string,
): Promise<ActionResult<DocumentRevisionEntity[]>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    if (!(await documentRepository.checkAccess(id, userId, true))) {
      throw new Error("Forbidden");
    }
    return documentRepository.listRevisions(id);
  });
}

export async function restoreDocumentVersionAction(
  id: string,
  revisionId: string,
): Promise<ActionResult<DocumentEntity>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    return documentRepository.restoreRevision(id, revisionId, userId);
  });
}

// ── comments ─────────────────────────────────────────────────────────────────
// Comment ACL: anyone who can READ the doc may list + create comments; only the
// author (or an org admin) may delete one. Read access is the unified-visibility
// checkAccess(readOnly=true) — the same gate the Electric shape proxy uses.

export async function listDocumentCommentsAction(
  documentId: string,
): Promise<ActionResult<DocumentCommentWithUser[]>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    if (!(await documentRepository.checkAccess(documentId, userId, true))) {
      throw new Error("Forbidden");
    }
    return documentCommentRepository.listByDocument(documentId, userId);
  });
}

export async function createDocumentCommentAction(input: {
  documentId: string;
  content: Record<string, unknown>;
  parentId?: string | null;
  mentionedUserIds?: string[];
}): Promise<ActionResult<DocumentCommentWithUser>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    if (
      !(await documentRepository.checkAccess(input.documentId, userId, true))
    ) {
      throw new Error("Forbidden");
    }
    assertSaneContent(input.content);
    if (!input.content || typeof input.content !== "object") {
      throw new Error("Comment content is required");
    }
    if (input.parentId) {
      const parent = await documentCommentRepository.getCommentOwner(
        input.parentId,
      );
      if (!parent || parent.documentId !== input.documentId) {
        throw new Error("Parent comment not found");
      }
    }
    const comment = await documentCommentRepository.insertComment({
      documentId: input.documentId,
      authorId: userId,
      parentId: input.parentId ?? null,
      content: input.content,
    });

    // Fire mention notifications for @tagged colleagues (skip self-mentions).
    const mentioned = (input.mentionedUserIds ?? []).filter(
      (id) => id !== userId,
    );
    if (mentioned.length > 0) {
      await mentionNotificationRepository.insertMentions(
        mentioned.map((recipientId) => ({
          recipientId,
          authorId: userId,
          documentId: input.documentId,
          commentId: comment.id,
        })),
      );
    }

    return comment;
  });
}

export async function deleteDocumentCommentAction(
  commentId: string,
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Unauthorized");

    const comment = await documentCommentRepository.getCommentOwner(commentId);
    if (!comment) throw new Error("Comment not found");

    const isAuthor = comment.authorId === userId;
    const isAdmin = getIsUserAdmin(session?.user ?? undefined);
    if (!isAuthor && !isAdmin) {
      throw new Error("Forbidden");
    }
    await documentCommentRepository.deleteComment(
      commentId,
      userId,
      /* allowAnyAuthor */ isAdmin,
    );
  });
}
