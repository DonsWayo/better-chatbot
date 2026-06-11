import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";
import { ingestDocument } from "lib/ai/embeddings/ingest";
import { scanIngestText } from "lib/ai/guardrails/ingest-scan";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import {
  ExtractedTextTooLargeError,
  MAX_UPLOAD_BYTES,
  UnsupportedFileTypeError,
  extractTextFromFile,
} from "lib/file-ingest/extract";
import { NextResponse } from "next/server";

/**
 * Multipart sibling of POST /api/knowledge/ingest — upload a FILE
 * (.pdf / .docx / .txt / .md) instead of pasting text. The server extracts
 * the text and feeds it to the same chunk → embed → store pipeline.
 *
 * FormData fields:
 * - file          (required) the document
 * - collectionId  (required)
 * - sourceRef     (optional) label; defaults to the filename
 *
 * Access gate mirrors the JSON ingest route: admin only.
 */

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Admin required to ingest knowledge" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const collectionId = form.get("collectionId");

  if (typeof collectionId !== "string" || !collectionId) {
    return NextResponse.json(
      { error: "collectionId required" },
      { status: 400 },
    );
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const fileName = file instanceof File ? file.name : "";
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  const [collection] = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, collectionId));
  if (!collection) {
    return NextResponse.json(
      { error: "Collection not found" },
      { status: 404 },
    );
  }

  const sourceRefField = form.get("sourceRef");
  const sourceRef =
    (typeof sourceRefField === "string" && sourceRefField.trim()) ||
    fileName ||
    "upload";

  let text: string;
  let pageCount: number | undefined;
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    // Prefer the filename for type detection — browsers send unreliable MIME
    // types for .md (often application/octet-stream); fall back to MIME.
    const extracted = await extractTextFromFile(buffer, fileName || file.type);
    text = extracted.text;
    pageCount = extracted.pageCount;
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    if (err instanceof ExtractedTextTooLargeError) {
      return NextResponse.json({ error: err.message }, { status: 413 });
    }
    return NextResponse.json(
      {
        error: `Could not extract text from "${fileName || "file"}". The file may be corrupted or password-protected.`,
      },
      { status: 422 },
    );
  }

  if (!text) {
    return NextResponse.json(
      {
        error:
          "No extractable text found in the file (is it a scanned/image-only document?)",
      },
      { status: 422 },
    );
  }

  // W7 guardrails (ADR-0008): same ingest-time scan as the JSON route —
  // injection patterns stripped, secrets/PII redacted per org policy,
  // warnings surfaced instead of blocking (see docs/governance/guardrails).
  const scanned = scanIngestText(text);

  const chunks = await ingestDocument(scanned.text, {
    collectionId,
    sourceRef,
    attribution: { userId: session.user.id },
  });

  return NextResponse.json({
    ok: true,
    collectionId,
    sourceRef,
    chunks,
    pageCount,
    characters: text.length,
    warnings: scanned.warnings,
  });
}
