import { describe, it, expect } from "vitest";
import { formatCsvPreviewText, parseCsvPreview } from "./csv";

describe("parseCsvPreview", () => {
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

  it("formats preview text with summary metadata", () => {
    const csv = "col1,col2\n1,2\n3,4\n";
    const preview = parseCsvPreview(Buffer.from(csv));
    const text = formatCsvPreviewText("sample.csv", preview);
    expect(text).toContain("sample.csv");
    expect(text).toContain("rows: 3");
    expect(text).toContain("cols: 2");
    expect(text).toContain("| col1 | col2 |");
  });
});

describe("parseCsvPreview — return type invariants", () => {
  it("returns object with header, rows, columns, totalRows, markdownTable", () => {
    const csv = "a,b\n1,2\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result).toHaveProperty("header");
    expect(result).toHaveProperty("rows");
    expect(result).toHaveProperty("columns");
    expect(result).toHaveProperty("totalRows");
    expect(result).toHaveProperty("markdownTable");
  });

  it("header is an array of strings", () => {
    const result = parseCsvPreview(Buffer.from("x,y,z\n1,2,3\n"));
    expect(Array.isArray(result.header)).toBe(true);
    for (const h of result.header) {
      expect(typeof h).toBe("string");
    }
  });

  it("rows is an array of arrays", () => {
    const result = parseCsvPreview(Buffer.from("a,b\n1,2\n3,4\n"));
    expect(Array.isArray(result.rows)).toBe(true);
    for (const row of result.rows) {
      expect(Array.isArray(row)).toBe(true);
    }
  });

  it("columns equals header length", () => {
    const result = parseCsvPreview(Buffer.from("a,b,c\n1,2,3\n"));
    expect(result.columns).toBe(result.header.length);
  });

  it("markdownTable is a non-empty string", () => {
    const result = parseCsvPreview(Buffer.from("a,b\n1,2\n"));
    expect(typeof result.markdownTable).toBe("string");
    expect(result.markdownTable.length).toBeGreaterThan(0);
  });
});

describe("parseCsvPreview — edge case invariants", () => {
  it("single column CSV parses correctly", () => {
    const csv = "name\nAlice\nBob\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.header).toEqual(["name"]);
    expect(result.rows[0]).toEqual(["Alice"]);
  });

  it("maxCols limits columns returned", () => {
    const csv = "a,b,c,d,e\n1,2,3,4,5\n";
    const result = parseCsvPreview(Buffer.from(csv), { maxCols: 3 });
    expect(result.header.length).toBe(3);
    expect(result.columns).toBe(3);
  });

  it("maxRows limits data rows returned", () => {
    const csv = "a,b\n1,2\n3,4\n5,6\n7,8\n";
    const result = parseCsvPreview(Buffer.from(csv), { maxRows: 2 });
    expect(result.rows.length).toBe(2);
  });
});

describe("formatCsvPreviewText — return type invariants", () => {
  it("returns a non-empty string", () => {
    const preview = parseCsvPreview(Buffer.from("a,b\n1,2\n"));
    const text = formatCsvPreviewText("f.csv", preview);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("includes the filename in the output", () => {
    const preview = parseCsvPreview(Buffer.from("a\n1\n"));
    const text = formatCsvPreviewText("mydata.csv", preview);
    expect(text).toContain("mydata.csv");
  });
});
