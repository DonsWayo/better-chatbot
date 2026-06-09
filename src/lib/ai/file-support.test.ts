import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_PART_MIME_TYPES,
  OPENAI_FILE_MIME_TYPES,
  GEMINI_FILE_MIME_TYPES,
  ANTHROPIC_FILE_MIME_TYPES,
  XAI_FILE_MIME_TYPES,
  INGEST_SUPPORTED_MIME,
  isFilePartSupported,
  isIngestSupported,
} from "./file-support";

describe("isFilePartSupported", () => {
  it("returns false when mime is missing", () => {
    expect(isFilePartSupported(undefined)).toBe(false);
  });

  it("returns true for default supported image types", () => {
    expect(isFilePartSupported("image/jpeg")).toBe(true);
    expect(isFilePartSupported("image/png")).toBe(true);
    expect(isFilePartSupported("image/webp")).toBe(true);
    expect(isFilePartSupported("image/gif")).toBe(true);
  });

  it("returns true for default supported document types", () => {
    expect(isFilePartSupported("application/pdf")).toBe(true);
  });

  it("returns false for unsupported mime types by default", () => {
    expect(isFilePartSupported("text/plain")).toBe(false);
    expect(isFilePartSupported("application/vnd.ms-excel")).toBe(false);
    expect(isFilePartSupported("video/mp4")).toBe(false);
    expect(isFilePartSupported("text/csv")).toBe(false);
  });

  it("respects an explicitly provided mime whitelist", () => {
    const whitelist = ["application/pdf"];
    expect(isFilePartSupported("application/pdf", whitelist)).toBe(true);
    expect(isFilePartSupported("image/png", whitelist)).toBe(false);
  });

  it("treats an empty whitelist as no support", () => {
    expect(isFilePartSupported("image/png", [])).toBe(false);
  });

  it("accepts provider-specific mime type arrays as whitelist", () => {
    for (const mime of OPENAI_FILE_MIME_TYPES) {
      expect(isFilePartSupported(mime, OPENAI_FILE_MIME_TYPES)).toBe(true);
    }
  });
});

describe("DEFAULT_FILE_PART_MIME_TYPES", () => {
  it("contains the expected image types", () => {
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("image/jpeg");
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("image/png");
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("image/webp");
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("image/gif");
  });

  it("contains application/pdf", () => {
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("application/pdf");
  });

  it("has at least 5 entries", () => {
    expect(DEFAULT_FILE_PART_MIME_TYPES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("provider-specific MIME type arrays", () => {
  it("OPENAI_FILE_MIME_TYPES extends default types", () => {
    for (const mime of DEFAULT_FILE_PART_MIME_TYPES) {
      expect(OPENAI_FILE_MIME_TYPES).toContain(mime);
    }
  });

  it("GEMINI_FILE_MIME_TYPES extends default types", () => {
    for (const mime of DEFAULT_FILE_PART_MIME_TYPES) {
      expect(GEMINI_FILE_MIME_TYPES).toContain(mime);
    }
  });

  it("ANTHROPIC_FILE_MIME_TYPES extends default types", () => {
    for (const mime of DEFAULT_FILE_PART_MIME_TYPES) {
      expect(ANTHROPIC_FILE_MIME_TYPES).toContain(mime);
    }
  });

  it("XAI_FILE_MIME_TYPES extends default types", () => {
    for (const mime of DEFAULT_FILE_PART_MIME_TYPES) {
      expect(XAI_FILE_MIME_TYPES).toContain(mime);
    }
  });
});

describe("isIngestSupported", () => {
  it("returns false for undefined mime", () => {
    expect(isIngestSupported(undefined)).toBe(false);
  });

  it("returns true for text/csv", () => {
    expect(isIngestSupported("text/csv")).toBe(true);
  });

  it("returns true for application/csv", () => {
    expect(isIngestSupported("application/csv")).toBe(true);
  });

  it("returns false for non-ingest types", () => {
    expect(isIngestSupported("image/jpeg")).toBe(false);
    expect(isIngestSupported("application/pdf")).toBe(false);
    expect(isIngestSupported("text/plain")).toBe(false);
  });
});

describe("INGEST_SUPPORTED_MIME", () => {
  it("includes text/csv", () => {
    expect(INGEST_SUPPORTED_MIME.has("text/csv")).toBe(true);
  });

  it("includes application/csv", () => {
    expect(INGEST_SUPPORTED_MIME.has("application/csv")).toBe(true);
  });
});
