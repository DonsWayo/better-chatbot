/**
 * Shared (client-safe) constants for knowledge file ingestion.
 * Kept separate from `extract.ts`, which is server-only.
 */

/** Hard cap on extracted text size (~2M chars ≈ 500k tokens). */
export const MAX_EXTRACTED_CHARS = 2_000_000;

/** Max upload size for knowledge files — extraction happens in-memory. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/** Filename pattern for files the knowledge upload accepts. */
export const SUPPORTED_FILE_PATTERN = /\.(pdf|docx|txt|md|markdown)$/i;

/** `accept` attribute value for the knowledge upload file input. */
export const SUPPORTED_FILE_ACCEPT =
  ".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
