import { describe, it, expect } from "vitest";
import { formatCsvPreviewText, parseCsvPreview } from "./csv";

describe("parseCsvPreview — basic parsing", () => {
  it("parses simple CSV and limits rows/cols", () => {
    const csv = "a,b,c\n1,2,3\n4,5,6\n7,8,9\n";
    const res = parseCsvPreview(Buffer.from(csv), { maxRows: 2, maxCols: 2 });
    expect(res.header).toEqual(["a", "b"]);
    expect(res.rows).toEqual([
      ["1", "2"],
      ["4", "5"],
    ]);
    expect(res.columns).toBe(2);
    expect(res.totalRows).toBe(4); // includes header
    expect(res.markdownTable).toContain("| a | b |");
  });

  it("handles quoted fields and escaped quotes", () => {
    const csv = 'name,desc\n"ACME, Inc.","He said ""hello"""\n';
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.header).toEqual(["name", "desc"]);
    expect(res.rows[0]).toEqual(["ACME, Inc.", 'He said "hello"']);
  });

  it("parses CRLF line endings correctly", () => {
    const csv = "x,y\r\n10,20\r\n30,40\r\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.header).toEqual(["x", "y"]);
    expect(res.rows[0]).toEqual(["10", "20"]);
    expect(res.rows[1]).toEqual(["30", "40"]);
  });

  it("returns empty rows array for header-only CSV", () => {
    const csv = "col1,col2\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.header).toEqual(["col1", "col2"]);
    expect(res.rows).toHaveLength(0);
  });

  it("respects maxRows limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `${i},${i * 2}`).join("\n");
    const csv = `a,b\n${rows}\n`;
    const res = parseCsvPreview(Buffer.from(csv), { maxRows: 3 });
    expect(res.rows).toHaveLength(3);
  });

  it("escapes pipe characters in markdown table", () => {
    const csv = "col\nvalue|with|pipes\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.markdownTable).toContain("\\|");
  });

  it("produces a separator row in markdown table", () => {
    const csv = "a,b\n1,2\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.markdownTable).toContain("| --- | --- |");
  });

  it("reports totalRows including header row", () => {
    const csv = "h1,h2\nv1,v2\nv3,v4\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.totalRows).toBe(3);
  });
});

describe("formatCsvPreviewText", () => {
  it("formats preview text with summary metadata", () => {
    const csv = "col1,col2\n1,2\n3,4\n";
    const preview = parseCsvPreview(Buffer.from(csv));
    const text = formatCsvPreviewText("sample.csv", preview);
    expect(text).toContain("sample.csv");
    expect(text).toContain("rows: 3");
    expect(text).toContain("cols: 2");
    expect(text).toContain("| col1 | col2 |");
  });

  it("includes the markdown table from the preview", () => {
    const csv = "name,age\nAlice,30\n";
    const preview = parseCsvPreview(Buffer.from(csv));
    const text = formatCsvPreviewText("data.csv", preview);
    expect(text).toContain("name");
    expect(text).toContain("Alice");
  });
});
