import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ExtractedTextTooLargeError,
  MAX_EXTRACTED_CHARS,
  UnsupportedFileTypeError,
  detectFileKind,
  extractTextFromFile,
} from "./extract";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name));

describe("detectFileKind", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["report.PDF", "pdf"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "docx",
    ],
    ["minutes.docx", "docx"],
    ["text/plain", "text"],
    ["text/plain; charset=utf-8", "text"],
    ["text/markdown", "text"],
    ["notes.txt", "text"],
    ["readme.md", "text"],
    ["guide.markdown", "text"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(detectFileKind(input)).toBe(expected);
  });

  it.each([
    "image/png",
    "application/zip",
    "presentation.pptx",
    "legacy.doc",
    "archive.tar.gz",
    "",
  ])("returns null for unsupported %s", (input) => {
    expect(detectFileKind(input)).toBeNull();
  });
});

describe("extractTextFromFile — txt/md passthrough", () => {
  it("decodes a UTF-8 text buffer", async () => {
    const result = await extractTextFromFile(
      Buffer.from("Hello plain text — útf8 ✓"),
      "notes.txt",
    );
    expect(result.text).toBe("Hello plain text — útf8 ✓");
    expect(result.pageCount).toBeUndefined();
  });

  it("accepts markdown by extension and trims whitespace", async () => {
    const result = await extractTextFromFile(
      Buffer.from("\n\n# Title\n\nBody.\n\n"),
      "doc.md",
    );
    expect(result.text).toBe("# Title\n\nBody.");
  });

  it("accepts text/plain MIME with parameters", async () => {
    const result = await extractTextFromFile(
      Buffer.from("mime detected"),
      "text/plain; charset=utf-8",
    );
    expect(result.text).toBe("mime detected");
  });
});

describe("extractTextFromFile — pdf (real fixture via unpdf)", () => {
  it("extracts text and page count from a real PDF", async () => {
    const result = await extractTextFromFile(
      fixture("sample.pdf"),
      "sample.pdf",
    );
    expect(result.text).toContain("Hello from a tiny PDF fixture");
    expect(result.pageCount).toBe(1);
  });

  it("detects PDFs by MIME type too", async () => {
    const result = await extractTextFromFile(
      fixture("sample.pdf"),
      "application/pdf",
    );
    expect(result.text).toContain("Hello from a tiny PDF fixture");
  });

  it("rejects a corrupted PDF with an error", async () => {
    await expect(
      extractTextFromFile(Buffer.from("%PDF-1.4 not really a pdf"), "bad.pdf"),
    ).rejects.toThrow();
  });
});

describe("extractTextFromFile — docx (real fixture via mammoth)", () => {
  it("extracts paragraphs from a real DOCX", async () => {
    const result = await extractTextFromFile(
      fixture("sample.docx"),
      "sample.docx",
    );
    expect(result.text).toContain("Hello from a tiny DOCX fixture");
    expect(result.text).toContain("Second paragraph for chunking.");
    expect(result.pageCount).toBeUndefined();
  });

  it("rejects a corrupted DOCX with an error", async () => {
    await expect(
      extractTextFromFile(Buffer.from("not a zip at all"), "bad.docx"),
    ).rejects.toThrow();
  });
});

describe("extractTextFromFile — guards", () => {
  it("throws UnsupportedFileTypeError for unknown types", async () => {
    await expect(
      extractTextFromFile(Buffer.from("data"), "slides.pptx"),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("unsupported error message names the offending type", async () => {
    await expect(
      extractTextFromFile(Buffer.from("data"), "image/png"),
    ).rejects.toThrow(/image\/png/);
  });

  it("throws ExtractedTextTooLargeError above the char cap", async () => {
    const huge = Buffer.from("a".repeat(MAX_EXTRACTED_CHARS + 1));
    await expect(extractTextFromFile(huge, "huge.txt")).rejects.toBeInstanceOf(
      ExtractedTextTooLargeError,
    );
  });

  it("accepts text exactly at the char cap", async () => {
    const exact = Buffer.from("a".repeat(MAX_EXTRACTED_CHARS));
    const result = await extractTextFromFile(exact, "exact.txt");
    expect(result.text.length).toBe(MAX_EXTRACTED_CHARS);
  });
});
