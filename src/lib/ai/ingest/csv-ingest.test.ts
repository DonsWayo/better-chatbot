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

  it("returns empty array for empty attachments list", async () => {
    const download = vi.fn();
    const parts = await buildCsvIngestionPreviewParts([], download);
    expect(parts).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  });

  it("processes multiple csv attachments independently", async () => {
    const attachments = [
      attachmentFactory({ url: "https://example.com/uploads/a.csv", filename: "a.csv" }),
      attachmentFactory({ url: "https://example.com/uploads/b.csv", filename: "b.csv" }),
    ];
    const download = vi.fn(async () => Buffer.from("x,y\n1,2\n", "utf8"));

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts).toHaveLength(2);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("still returns successful parts when one download fails", async () => {
    const attachments = [
      attachmentFactory({ url: "https://example.com/uploads/ok.csv", filename: "ok.csv" }),
      attachmentFactory({ url: "https://example.com/uploads/bad.csv", filename: "bad.csv" }),
    ];
    let callCount = 0;
    const download = vi.fn(async () => {
      callCount++;
      if (callCount === 2) throw new Error("fail");
      return Buffer.from("a,b\n1,2\n", "utf8");
    });

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts).toHaveLength(1);
  });

  it("skips non-source-url attachment types", async () => {
    const attachment = attachmentFactory({ type: "url" as any });
    const download = vi.fn();

    const parts = await buildCsvIngestionPreviewParts([attachment], download);

    expect(parts).toHaveLength(0);
    expect(download).not.toHaveBeenCalled();
  });

  it("preview text includes filename", async () => {
    const attachments = [attachmentFactory({ filename: "sales-report.csv" })];
    const download = vi.fn(async () => Buffer.from("month,revenue\nJan,1000\n", "utf8"));

    const parts = await buildCsvIngestionPreviewParts(attachments, download);

    expect(parts[0].text).toContain("sales-report.csv");
  });
});
