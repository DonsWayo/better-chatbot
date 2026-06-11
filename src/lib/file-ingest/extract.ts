import "server-only";

/**
 * File text extraction for knowledge ingestion.
 *
 * Turns an uploaded file (PDF / DOCX / plain text / markdown) into plain text
 * ready for the chunk → embed → store pipeline (`lib/ai/embeddings/ingest`).
 *
 * - PDF   → `unpdf` (pdf.js based, no native deps, serverless-friendly)
 * - DOCX  → `mammoth` (extractRawText)
 * - txt/md → UTF-8 passthrough
 *
 * Anything else is rejected with a clear error, and extracted text is capped
 * at {@link MAX_EXTRACTED_CHARS} so a pathological file can't flood the
 * embedding pipeline.
 */

import { MAX_EXTRACTED_CHARS } from "./constants";

export { MAX_EXTRACTED_CHARS, MAX_UPLOAD_BYTES } from "./constants";

export type SupportedFileKind = "pdf" | "docx" | "text";

export interface ExtractedFile {
  text: string;
  /** Page count — only meaningful for PDFs. */
  pageCount?: number;
}

export class UnsupportedFileTypeError extends Error {
  constructor(mimeOrName: string) {
    super(
      `Unsupported file type: "${mimeOrName}". Supported: .pdf, .docx, .txt, .md`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

export class ExtractedTextTooLargeError extends Error {
  constructor(chars: number) {
    super(
      `Extracted text is too large (${chars.toLocaleString()} chars, limit ${MAX_EXTRACTED_CHARS.toLocaleString()}). Split the document and try again.`,
    );
    this.name = "ExtractedTextTooLargeError";
  }
}

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);

/**
 * Detect the file kind from a MIME type or a filename. Returns `null` when
 * the type is not supported (caller decides whether to throw).
 */
export function detectFileKind(mimeOrName: string): SupportedFileKind | null {
  const value = mimeOrName.trim().toLowerCase();
  if (!value) return null;

  // MIME types (strip optional parameters like "; charset=utf-8")
  const mime = value.split(";")[0].trim();
  if (mime === PDF_MIME) return "pdf";
  if (mime === DOCX_MIME) return "docx";
  if (TEXT_MIMES.has(mime)) return "text";

  // File extensions
  if (/\.pdf$/.test(value)) return "pdf";
  if (/\.docx$/.test(value)) return "docx";
  if (/\.(txt|md|markdown)$/.test(value)) return "text";

  return null;
}

async function extractPdf(buffer: Uint8Array): Promise<ExtractedFile> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // Copy: pdf.js transfers/detaches the buffer it is given.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text, pageCount: totalPages };
}

async function extractDocx(buffer: Uint8Array): Promise<ExtractedFile> {
  const { default: mammoth } = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return { text: result.value };
}

/**
 * Extract plain text from an uploaded file.
 *
 * @param buffer     file content
 * @param mimeOrName MIME type (preferred) or filename — used to pick the parser
 * @throws UnsupportedFileTypeError for unknown types
 * @throws ExtractedTextTooLargeError when text exceeds {@link MAX_EXTRACTED_CHARS}
 */
export async function extractTextFromFile(
  buffer: Buffer | Uint8Array,
  mimeOrName: string,
): Promise<ExtractedFile> {
  const kind = detectFileKind(mimeOrName);
  if (!kind) throw new UnsupportedFileTypeError(mimeOrName);

  const bytes: Uint8Array = buffer;

  let extracted: ExtractedFile;
  switch (kind) {
    case "pdf":
      extracted = await extractPdf(bytes);
      break;
    case "docx":
      extracted = await extractDocx(bytes);
      break;
    case "text":
      extracted = { text: new TextDecoder("utf-8").decode(bytes) };
      break;
  }

  const text = extracted.text.trim();
  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new ExtractedTextTooLargeError(text.length);
  }
  return { ...extracted, text };
}
