"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import type { DocumentCommentWithUser } from "lib/db/pg/repositories/document-comment-repository.pg";
import type {
  DocumentEntity,
  DocumentRevisionEntity,
  DocumentSummary,
} from "lib/db/pg/repositories/document-repository.pg";
import {
  documentCommentRepository,
  documentRepository,
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
}): Promise<ActionResult<DocumentCommentWithUser>> {
  return toActionResult(async () => {
    const userId = await requireUserId();
    // Anyone who can READ the doc may comment.
    if (
      !(await documentRepository.checkAccess(input.documentId, userId, true))
    ) {
      throw new Error("Forbidden");
    }
    assertSaneContent(input.content);
    if (!input.content || typeof input.content !== "object") {
      throw new Error("Comment content is required");
    }
    // A reply must point at a comment that actually belongs to this doc.
    if (input.parentId) {
      const parent = await documentCommentRepository.getCommentOwner(
        input.parentId,
      );
      if (!parent || parent.documentId !== input.documentId) {
        throw new Error("Parent comment not found");
      }
    }
    return documentCommentRepository.insertComment({
      documentId: input.documentId,
      authorId: userId,
      parentId: input.parentId ?? null,
      content: input.content,
    });
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
