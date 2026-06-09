import { describe, expect, it, vi } from "vitest";
import { buildCsvIngestionPreviewParts } from "./csv-ingest";
import type { ChatAttachment } from "app-types/chat";

const attachmentFactory = (
  overrides: Partial<ChatAttachment> = {},
): ChatAttachment => ({
  type: "source-url",
  url: "https://example.com/uploads/data.csv",
  mediaType: "text/csv",
  filename: "data.csv",
  ...overrides,
});

describe("buildCsvIngestionPreviewParts", () => {
  it("returns preview text for csv attachments", async () => {
    const attachments = [attachmentFactory()];
    const download = vi.fn(async () =>
      Buffer.from("col1,col2\n1,2\n3,4\n", "utf8"),
    );

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe("text");
    expect(parts[0].ingestionPreview).toBe(true);
    expect(parts[0].text).toContain("rows: 3");
    expect(parts[0].text).toContain("| col1 | col2 |");
  });

  it("skips attachments that are not csv-like", async () => {
    const attachments = [
      attachmentFactory({
        mediaType: "application/json",
        filename: "data.json",
      }),
    ];
    const download = vi.fn();

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  });

  it("ignores attachments with invalid URLs", async () => {
    const attachments = [attachmentFactory({ url: "not-a-url" })];
    const download = vi.fn();

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  });

  it("continues when download fails", async () => {
    const attachments = [attachmentFactory()];
    const download = vi.fn(async () => {
      throw new Error("network");
    });

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts).toHaveLength(0);
    expect(download).toHaveBeenCalled();
  });
});

describe("buildCsvIngestionPreviewParts — return type invariants", () => {
  it("always returns an array", async () => {
    const result = await buildCsvIngestionPreviewParts([], vi.fn());
    expect(Array.isArray(result)).toBe(true);
  });

  it("each returned part has type text", async () => {
    const download = vi.fn(async () => Buffer.from("a,b\n1,2\n", "utf8"));
    const parts = await buildCsvIngestionPreviewParts([attachmentFactory()], download);
    for (const p of parts) {
      expect(p.type).toBe("text");
    }
  });

  it("each returned part has ingestionPreview: true", async () => {
    const download = vi.fn(async () => Buffer.from("a,b\n1,2\n", "utf8"));
    const parts = await buildCsvIngestionPreviewParts([attachmentFactory()], download);
    for (const p of parts) {
      expect(p.ingestionPreview).toBe(true);
    }
  });

  it("each returned part has a non-empty text field", async () => {
    const download = vi.fn(async () => Buffer.from("a,b\n1,2\n", "utf8"));
    const parts = await buildCsvIngestionPreviewParts([attachmentFactory()], download);
    for (const p of parts) {
      expect(typeof p.text).toBe("string");
      expect(p.text.length).toBeGreaterThan(0);
    }
  });
});

describe("buildCsvIngestionPreviewParts — call count invariants", () => {
  it("calls download once per valid csv attachment", async () => {
    const download = vi.fn(async () => Buffer.from("a\n1\n", "utf8"));
    const attachments = [
      attachmentFactory({ url: "https://x.com/f1.csv" }),
      attachmentFactory({ url: "https://x.com/f2.csv" }),
    ];
    await buildCsvIngestionPreviewParts(attachments, download);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("does not call download for non-csv attachments", async () => {
    const download = vi.fn();
    const attachments = [
      attachmentFactory({ mediaType: "application/pdf", filename: "file.pdf" }),
    ];
    await buildCsvIngestionPreviewParts(attachments, download);
    expect(download).not.toHaveBeenCalled();
  });

  it("handles empty attachment list without calling download", async () => {
    const download = vi.fn();
    const parts = await buildCsvIngestionPreviewParts([], download);
    expect(parts).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  });
});

describe("buildCsvIngestionPreviewParts — content invariants", () => {
  it("part text contains the csv header row", async () => {
    const download = vi.fn(async () => Buffer.from("col1,col2\n1,2\n", "utf8"));
    const parts = await buildCsvIngestionPreviewParts([attachmentFactory()], download);
    expect(parts[0].text).toContain("col1");
    expect(parts[0].text).toContain("col2");
  });

  it("processes multiple csv attachments producing one part each", async () => {
    const download = vi.fn(async () => Buffer.from("a,b\n1,2\n", "utf8"));
    const attachments = [
      attachmentFactory({ url: "https://x.com/f1.csv" }),
      attachmentFactory({ url: "https://x.com/f2.csv" }),
    ];
    const parts = await buildCsvIngestionPreviewParts(attachments, download);
    expect(parts).toHaveLength(2);
  });

  it("returns empty array when all attachments fail download", async () => {
    const download = vi.fn(async () => { throw new Error("fail"); });
    const attachments = [
      attachmentFactory({ url: "https://x.com/f1.csv" }),
      attachmentFactory({ url: "https://x.com/f2.csv" }),
    ];
    const parts = await buildCsvIngestionPreviewParts(attachments, download);
    expect(parts).toHaveLength(0);
  });
});
