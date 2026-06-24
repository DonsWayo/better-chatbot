/**
 * Unit tests for composer input validation and message building logic.
 *
 * The PromptInput component (src/components/prompt-input.tsx) embeds its core
 * logic inside the `submit` handler and supporting callbacks. This file lifts
 * those pure behaviours out so they can be tested without a DOM or React
 * context, then covers the shared file-support utilities that drive attachment
 * routing decisions.
 *
 * Functions under test (extracted verbatim from prompt-input.tsx):
 *   - validateMessageInput(input)         — rejects empty / whitespace-only
 *   - hasUploadingFiles(files)            — guard while uploads are in progress
 *   - buildAttachmentParts(files, …)      — routes files to FileUIPart or source-url
 *   - buildSendPayload(input, files, …)   — full message shape sent to sendMessage()
 *   - isFilePartSupported / isIngestSupported from lib/ai/file-support
 */

import {
  DEFAULT_FILE_PART_MIME_TYPES,
  INGEST_SUPPORTED_MIME,
  isFilePartSupported,
  isIngestSupported,
} from "@/lib/ai/file-support";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Types mirrored from the component so tests compile without importing React.
// ---------------------------------------------------------------------------

interface UploadedFile {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  isUploading?: boolean;
  progress?: number;
  previewUrl?: string;
  dataUrl?: string;
}

interface FileUIPart {
  type: "file";
  url: string;
  mediaType: string;
  filename: string;
}

interface SourceUrlPart {
  type: "source-url";
  url: string;
  title: string;
  mediaType: string;
}

interface TextUIPart {
  type: "text";
  text: string;
  ingestionPreview?: boolean;
}

type AttachmentPart = FileUIPart | SourceUrlPart | TextUIPart;

// ---------------------------------------------------------------------------
// Pure functions extracted from prompt-input.tsx — tested in isolation.
// ---------------------------------------------------------------------------

/** Returns true when the trimmed input is non-empty (can send). */
function validateMessageInput(input: string): boolean {
  return input.trim().length > 0;
}

/** Returns true when at least one file is still uploading. */
function hasUploadingFiles(files: UploadedFile[]): boolean {
  return files.some((f) => f.isUploading);
}

/**
 * Builds the attachment parts array from the uploaded file list.
 * Mirrors the `attachmentParts` reduce block in submit().
 *
 * - Files whose MIME type is in supportedMimeTypes → FileUIPart
 * - Everything else → source-url part (rich UI fallback, filtered pre-send)
 * - Files with no resolvable URL are skipped entirely.
 */
function buildAttachmentParts(
  files: UploadedFile[],
  supportedMimeTypes?: readonly string[],
): AttachmentPart[] {
  return files.reduce<AttachmentPart[]>((acc, file) => {
    const supported = isFilePartSupported(file.mimeType, supportedMimeTypes);
    const link = file.url || file.dataUrl || "";
    if (!link) return acc;
    if (supported) {
      acc.push({
        type: "file",
        url: link,
        mediaType: file.mimeType,
        filename: file.name,
      } as FileUIPart);
    } else {
      acc.push({
        type: "source-url",
        url: link,
        title: file.name,
        mediaType: file.mimeType,
      } as SourceUrlPart);
    }
    return acc;
  }, []);
}

/**
 * Builds the full payload that is passed to sendMessage().
 * Mirrors the full submit() body from prompt-input.tsx.
 */
function buildSendPayload(
  input: string,
  files: UploadedFile[],
  supportedMimeTypes?: readonly string[],
): { role: "user"; parts: AttachmentPart[] } {
  const userMessage = input.trim();
  const attachmentParts = buildAttachmentParts(files, supportedMimeTypes);

  if (attachmentParts.length) {
    const summary = files
      .map((file, index) => {
        const type = file.mimeType || "unknown";
        return `${index + 1}. ${file.name} (${type})`;
      })
      .join("\n");

    attachmentParts.unshift({
      type: "text",
      text: `Attached files:\n${summary}`,
      ingestionPreview: true,
    } as TextUIPart);
  }

  return {
    role: "user",
    parts: [...attachmentParts, { type: "text", text: userMessage }],
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: "file-1",
    url: "https://cdn.example.com/file.png",
    name: "file.png",
    mimeType: "image/png",
    size: 1024,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("validateMessageInput — input gating", () => {
  it("accepts a normal non-empty string", () => {
    expect(validateMessageInput("Hello world")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateMessageInput("")).toBe(false);
  });

  it("rejects a whitespace-only string (spaces)", () => {
    expect(validateMessageInput("   ")).toBe(false);
  });

  it("rejects a whitespace-only string (tabs and newlines)", () => {
    expect(validateMessageInput("\t\n\r")).toBe(false);
  });

  it("accepts a string that is only whitespace after trimming one end", () => {
    expect(validateMessageInput("  hello")).toBe(true);
  });

  it("accepts a single character", () => {
    expect(validateMessageInput("a")).toBe(true);
  });

  it("accepts a very long message", () => {
    expect(validateMessageInput("x".repeat(10_000))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("hasUploadingFiles — upload-in-progress guard", () => {
  it("returns false for an empty file list", () => {
    expect(hasUploadingFiles([])).toBe(false);
  });

  it("returns false when all files are done uploading", () => {
    const files = [
      makeFile({ isUploading: false }),
      makeFile({ id: "file-2", isUploading: false }),
    ];
    expect(hasUploadingFiles(files)).toBe(false);
  });

  it("returns true when at least one file is uploading", () => {
    const files = [
      makeFile({ isUploading: false }),
      makeFile({ id: "file-2", isUploading: true, progress: 40 }),
    ];
    expect(hasUploadingFiles(files)).toBe(true);
  });

  it("returns true when the only file is uploading", () => {
    expect(hasUploadingFiles([makeFile({ isUploading: true })])).toBe(true);
  });

  it("treats undefined isUploading as falsy (not uploading)", () => {
    // The UploadedFile type marks isUploading as optional; undefined ≡ false.
    const file = makeFile();
    delete (file as any).isUploading;
    expect(hasUploadingFiles([file])).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("buildAttachmentParts — file routing", () => {
  it("returns an empty array when no files are provided", () => {
    expect(buildAttachmentParts([])).toHaveLength(0);
  });

  it("routes a supported image MIME to a FileUIPart", () => {
    const parts = buildAttachmentParts([makeFile({ mimeType: "image/png" })]);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("file");
    const part = parts[0] as FileUIPart;
    expect(part.mediaType).toBe("image/png");
    expect(part.filename).toBe("file.png");
  });

  it("routes an unsupported MIME to a source-url part", () => {
    const parts = buildAttachmentParts([
      makeFile({ mimeType: "application/zip", name: "archive.zip" }),
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("source-url");
    const part = parts[0] as SourceUrlPart;
    expect(part.title).toBe("archive.zip");
    expect(part.mediaType).toBe("application/zip");
  });

  it("skips files that have no resolvable URL", () => {
    const file = makeFile({ url: "", dataUrl: "" });
    const parts = buildAttachmentParts([file]);
    expect(parts).toHaveLength(0);
  });

  it("falls back to dataUrl when url is empty", () => {
    const file = makeFile({
      url: "",
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    const parts = buildAttachmentParts([file]);
    expect(parts).toHaveLength(1);
    const part = parts[0] as FileUIPart;
    expect(part.url).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("respects an explicit supportedMimeTypes whitelist", () => {
    // Only application/pdf is in the whitelist; image/png is NOT.
    const files = [
      makeFile({ id: "f1", mimeType: "image/png" }),
      makeFile({ id: "f2", mimeType: "application/pdf", name: "doc.pdf" }),
    ];
    const parts = buildAttachmentParts(files, ["application/pdf"]);
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe("source-url"); // png → fallback
    expect(parts[1].type).toBe("file"); // pdf → supported
  });

  it("uses url over dataUrl when both are present", () => {
    const file = makeFile({
      url: "https://cdn.example.com/real.png",
      dataUrl: "data:image/png;base64,abc",
    });
    const [part] = buildAttachmentParts([file]) as FileUIPart[];
    expect(part.url).toBe("https://cdn.example.com/real.png");
  });

  it("handles multiple files, some supported and some not", () => {
    const files = [
      makeFile({ id: "f1", mimeType: "image/jpeg", name: "photo.jpg" }),
      makeFile({ id: "f2", mimeType: "text/csv", name: "data.csv" }),
      makeFile({ id: "f3", mimeType: "image/webp", name: "shot.webp" }),
    ];
    const parts = buildAttachmentParts(files);
    const types = parts.map((p) => p.type);
    expect(types).toEqual(["file", "source-url", "file"]);
  });
});

// ---------------------------------------------------------------------------

describe("buildSendPayload — message shape", () => {
  it("produces a user role message", () => {
    const payload = buildSendPayload("Hello", []);
    expect(payload.role).toBe("user");
  });

  it("includes a text part with the trimmed message", () => {
    const payload = buildSendPayload("  Hi there  ", []);
    const textPart = payload.parts.find(
      (p) => p.type === "text" && !(p as TextUIPart).ingestionPreview,
    ) as TextUIPart;
    expect(textPart).toBeDefined();
    expect(textPart.text).toBe("Hi there");
  });

  it("has exactly one part when there are no attachments", () => {
    const payload = buildSendPayload("Just text", []);
    expect(payload.parts).toHaveLength(1);
    expect(payload.parts[0].type).toBe("text");
  });

  it("prepends an ingestion-preview summary part when files are present", () => {
    const file = makeFile({ name: "photo.png", mimeType: "image/png" });
    const payload = buildSendPayload("check this", [file]);
    const preview = payload.parts[0] as TextUIPart;
    expect(preview.type).toBe("text");
    expect(preview.ingestionPreview).toBe(true);
    expect(preview.text).toContain("Attached files:");
    expect(preview.text).toContain("photo.png");
    expect(preview.text).toContain("image/png");
  });

  it("puts the text message LAST in the parts array", () => {
    const file = makeFile();
    const payload = buildSendPayload("my question", [file]);
    const last = payload.parts[payload.parts.length - 1] as TextUIPart;
    expect(last.type).toBe("text");
    expect(last.text).toBe("my question");
    expect(last.ingestionPreview).toBeUndefined();
  });

  it("numbers files correctly in the summary (1-indexed)", () => {
    const files = [
      makeFile({ id: "a", name: "a.png", mimeType: "image/png" }),
      makeFile({ id: "b", name: "b.pdf", mimeType: "application/pdf" }),
    ];
    const payload = buildSendPayload("check", files);
    const preview = payload.parts[0] as TextUIPart;
    expect(preview.text).toContain("1. a.png");
    expect(preview.text).toContain("2. b.pdf");
  });

  it("skips files with no URL from parts but still includes them in summary", () => {
    // A file with no url/dataUrl is excluded from attachment parts but the
    // summary is built from the raw files array — so both summary items appear
    // but the part count differs.
    const files = [
      makeFile({ id: "good", url: "https://cdn.example.com/a.png" }),
      makeFile({ id: "bad", url: "", dataUrl: "" }),
    ];
    const payload = buildSendPayload("look", files);
    // summary part + 1 file part + text part
    expect(payload.parts).toHaveLength(3);
    const preview = payload.parts[0] as TextUIPart;
    // Both files still listed in the summary (summary is from raw files array)
    expect(preview.text).toContain("1.");
    expect(preview.text).toContain("2.");
  });

  it("does not prepend a summary when all files have no URL", () => {
    const file = makeFile({ url: "", dataUrl: "" });
    const payload = buildSendPayload("empty", [file]);
    // No attachments resolved → no summary → only the text part
    expect(payload.parts).toHaveLength(1);
    expect(payload.parts[0].type).toBe("text");
  });
});

// ---------------------------------------------------------------------------

describe("isFilePartSupported — accept input file types", () => {
  it("returns true for image/jpeg (always-supported image format)", () => {
    expect(isFilePartSupported("image/jpeg")).toBe(true);
  });

  it("returns true for image/png", () => {
    expect(isFilePartSupported("image/png")).toBe(true);
  });

  it("returns true for image/webp", () => {
    expect(isFilePartSupported("image/webp")).toBe(true);
  });

  it("returns true for image/gif", () => {
    expect(isFilePartSupported("image/gif")).toBe(true);
  });

  it("returns true for application/pdf", () => {
    expect(isFilePartSupported("application/pdf")).toBe(true);
  });

  it("returns false for text/plain (not in default set)", () => {
    expect(isFilePartSupported("text/plain")).toBe(false);
  });

  it("returns false for video/mp4", () => {
    expect(isFilePartSupported("video/mp4")).toBe(false);
  });

  it("returns false for application/zip", () => {
    expect(isFilePartSupported("application/zip")).toBe(false);
  });

  it("returns false for undefined mime", () => {
    expect(isFilePartSupported(undefined)).toBe(false);
  });

  it("returns false for empty string mime", () => {
    expect(isFilePartSupported("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("isIngestSupported — CSV / ingest-path types", () => {
  it("returns true for text/csv", () => {
    expect(isIngestSupported("text/csv")).toBe(true);
  });

  it("returns true for application/csv", () => {
    expect(isIngestSupported("application/csv")).toBe(true);
  });

  it("returns false for image/jpeg (not in ingest set)", () => {
    expect(isIngestSupported("image/jpeg")).toBe(false);
  });

  it("returns false for application/pdf (file-part, not ingest)", () => {
    expect(isIngestSupported("application/pdf")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isIngestSupported(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isIngestSupported("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("DEFAULT_FILE_PART_MIME_TYPES invariants", () => {
  it("is an array", () => {
    expect(Array.isArray(DEFAULT_FILE_PART_MIME_TYPES)).toBe(true);
  });

  it("is non-empty", () => {
    expect(DEFAULT_FILE_PART_MIME_TYPES.length).toBeGreaterThan(0);
  });

  it("every entry is a non-empty string with a slash", () => {
    for (const mime of DEFAULT_FILE_PART_MIME_TYPES) {
      expect(typeof mime).toBe("string");
      expect(mime.length).toBeGreaterThan(0);
      expect(mime).toContain("/");
    }
  });
});

// ---------------------------------------------------------------------------

describe("INGEST_SUPPORTED_MIME invariants", () => {
  it("is a Set", () => {
    expect(INGEST_SUPPORTED_MIME).toBeInstanceOf(Set);
  });

  it("has text/csv", () => {
    expect(INGEST_SUPPORTED_MIME.has("text/csv")).toBe(true);
  });

  it("has application/csv", () => {
    expect(INGEST_SUPPORTED_MIME.has("application/csv")).toBe(true);
  });

  it("does not have image/jpeg", () => {
    expect(INGEST_SUPPORTED_MIME.has("image/jpeg")).toBe(false);
  });
});
