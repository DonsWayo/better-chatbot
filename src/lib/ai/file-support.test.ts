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

describe("file-support — return type invariants", () => {
  it("isFilePartSupported always returns a boolean", () => {
    for (const mime of [undefined, "", "image/png", "text/plain", "application/octet-stream"]) {
      expect(typeof isFilePartSupported(mime)).toBe("boolean");
    }
  });

  it("DEFAULT_FILE_PART_MIME_TYPES is an array", () => {
    expect(Array.isArray(DEFAULT_FILE_PART_MIME_TYPES)).toBe(true);
  });

  it("DEFAULT_FILE_PART_MIME_TYPES is non-empty", () => {
    expect(DEFAULT_FILE_PART_MIME_TYPES.length).toBeGreaterThan(0);
  });

  it("all entries in DEFAULT_FILE_PART_MIME_TYPES are non-empty strings", () => {
    for (const mime of DEFAULT_FILE_PART_MIME_TYPES) {
      expect(typeof mime).toBe("string");
      expect(mime.length).toBeGreaterThan(0);
    }
  });
});

describe("file-support — whitelist invariants", () => {
  it("undefined whitelist uses default mime set", () => {
    expect(isFilePartSupported("image/png", undefined)).toBe(true);
    expect(isFilePartSupported("text/plain", undefined)).toBe(false);
  });

  it("whitelist with one entry only matches that entry", () => {
    const wl = ["image/gif"];
    expect(isFilePartSupported("image/gif", wl)).toBe(true);
    expect(isFilePartSupported("image/png", wl)).toBe(false);
    expect(isFilePartSupported("application/pdf", wl)).toBe(false);
  });

  it("undefined mime with non-empty whitelist returns false", () => {
    expect(isFilePartSupported(undefined, ["image/png"])).toBe(false);
  });

  it("case sensitivity — uppercase mime does not match lowercase whitelist", () => {
    const wl = ["image/png"];
    expect(isFilePartSupported("IMAGE/PNG", wl)).toBe(false);
  });
});
