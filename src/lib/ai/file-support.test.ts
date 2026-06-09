import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILE_PART_MIME_TYPES,
  isFilePartSupported,
} from "./file-support";

describe("file-support", () => {
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
  });

  it("respects an explicitly provided mime whitelist", () => {
    const whitelist = ["application/pdf"];
    expect(isFilePartSupported("application/pdf", whitelist)).toBe(true);
    expect(isFilePartSupported("image/png", whitelist)).toBe(false);
  });

  it("treats an empty whitelist as no support", () => {
    expect(isFilePartSupported("image/png", [])).toBe(false);
  });

  it("exposes the default mime types constant", () => {
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("application/pdf");
    expect(DEFAULT_FILE_PART_MIME_TYPES).toContain("image/jpeg");
  });
});

describe("file-support — return type invariants", () => {
  it("isFilePartSupported always returns a boolean", () => {
    for (const mime of [undefined, "", "image/png", "text/plain", "application/octet-stream"]) {
      expect(typeof isFilePartSupported(mime as any)).toBe("boolean");
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
  it("null whitelist falls back to default behavior", () => {
    expect(isFilePartSupported("image/png", null as any)).toBe(true);
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
