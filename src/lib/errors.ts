/**
 * Simple custom error classes
 */

export class AppError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

// 401 Unauthorized Error
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

// 403 Forbidden Error
export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

/**
 * File storage error types
 */
export class FileStorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "FileStorageError";
  }
}

export class FileNotFoundError extends FileStorageError {
  constructor(fileId: string, cause?: unknown) {
    super(`File not found: ${fileId}`, "FILE_NOT_FOUND", cause);
    this.name = "FileNotFoundError";
  }
}

export class FileTooLargeError extends FileStorageError {
  constructor(size: number, maxSize: number, cause?: unknown) {
    super(
      `File too large: ${size} bytes (max: ${maxSize} bytes)`,
      "FILE_TOO_LARGE",
      cause,
    );
    this.name = "FileTooLargeError";
  }
}

export class StorageQuotaExceededError extends FileStorageError {
  constructor(cause?: unknown) {
    super("Storage quota exceeded", "QUOTA_EXCEEDED", cause);
    this.name = "StorageQuotaExceededError";
  }
}

export class UnsupportedFileTypeError extends FileStorageError {
  constructor(mimeType: string, cause?: unknown) {
    super(`Unsupported file type: ${mimeType}`, "UNSUPPORTED_TYPE", cause);
    this.name = "UnsupportedFileTypeError";
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/**
 * Extract a human-readable message from an API error body.
 *
 * API routes often respond with JSON bodies like `{"message":"Team budget
 * exhausted"}` or `{"error":"voice_not_configured","message":"..."}`. When
 * those bodies end up in an `Error.message` verbatim, the UI would render raw
 * JSON. This helper parses such strings and returns the embedded message
 * text; non-JSON input is returned as-is.
 */
export function extractApiErrorMessage(raw: unknown): string {
  if (typeof raw !== "string") {
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (typeof obj.message === "string" && obj.message) return obj.message;
      if (obj.error && typeof obj.error === "object") {
        return extractApiErrorMessage(obj.error);
      }
      if (typeof obj.error === "string" && obj.error) return obj.error;
    }
    return String(raw ?? "");
  }
  const text = raw.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return raw;
  try {
    return extractApiErrorMessage(JSON.parse(text));
  } catch {
    return raw;
  }
}
