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

describe("parseCsvPreview — advanced", () => {
  it("handles single-column CSV", () => {
    const csv = "id\n1\n2\n3\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.header).toEqual(["id"]);
    expect(res.columns).toBe(1);
    expect(res.rows).toHaveLength(3);
  });

  it("respects maxCols limit", () => {
    const csv = "a,b,c,d,e\n1,2,3,4,5\n";
    const res = parseCsvPreview(Buffer.from(csv), { maxCols: 3 });
    expect(res.header).toHaveLength(3);
    expect(res.rows[0]).toHaveLength(3);
  });

  it("handles empty cells", () => {
    const csv = "a,b\n,value\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.rows[0]).toEqual(["", "value"]);
  });

  it("returns correct columns count matching header length", () => {
    const csv = "x,y,z\n1,2,3\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.columns).toBe(3);
    expect(res.header).toHaveLength(3);
  });

  it("markdownTable has header and data rows", () => {
    const csv = "name,score\nBob,99\n";
    const res = parseCsvPreview(Buffer.from(csv));
    expect(res.markdownTable).toContain("| name | score |");
    expect(res.markdownTable).toContain("Bob");
    expect(res.markdownTable).toContain("99");
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

describe("parseCsvPreview — CRLF and whitespace handling", () => {
  it("handles CRLF line endings", () => {
    const csv = "col1,col2\r\nvalue1,value2\r\nvalue3,value4\r\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.header).toEqual(["col1", "col2"]);
    expect(result.rows[0]).toEqual(["value1", "value2"]);
    expect(result.rows[1]).toEqual(["value3", "value4"]);
  });

  it("preserves leading/trailing whitespace in unquoted fields", () => {
    const csv = "a,b\n  hello  ,  world  \n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.rows[0][0]).toBe("  hello  ");
    expect(result.rows[0][1]).toBe("  world  ");
  });

  it("handles empty fields", () => {
    const csv = "a,b,c\n,,\n1,,3\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.rows[0]).toEqual(["", "", ""]);
    expect(result.rows[1]).toEqual(["1", "", "3"]);
  });
});

describe("parseCsvPreview — markdown table output", () => {
  it("escapes pipe characters in cell values", () => {
    const csv = "col\nfoo|bar\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.markdownTable).toContain("foo\\|bar");
  });

  it("markdown table contains separator row", () => {
    const csv = "a,b\n1,2\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.markdownTable).toContain("---");
  });

  it("markdown table has header, separator, and body rows", () => {
    const csv = "x,y\n10,20\n30,40\n";
    const result = parseCsvPreview(Buffer.from(csv));
    const lines = result.markdownTable.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toMatch(/^\|/);
    expect(lines[1]).toContain("---");
    expect(lines[2]).toMatch(/^\|/);
  });

  it("markdown table includes all data rows up to maxRows", () => {
    const csv = "a\n1\n2\n3\n4\n5\n";
    const result = parseCsvPreview(Buffer.from(csv), { maxRows: 3 });
    const lines = result.markdownTable.split("\n");
    // header + separator + 3 data rows = 5 lines
    expect(lines.length).toBe(5);
  });
});

describe("parseCsvPreview — quoted field edge cases", () => {
  it("handles multiline values in quoted fields", () => {
    const csv = 'a,b\n"line1\nline2",value\n';
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.rows[0][0]).toBe("line1\nline2");
  });

  it("handles quoted field with only a comma", () => {
    const csv = 'a,b\n",",normal\n';
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.rows[0][0]).toBe(",");
    expect(result.rows[0][1]).toBe("normal");
  });

  it("handles double-quoted empty string", () => {
    const csv = 'a,b\n"",value\n';
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.rows[0][0]).toBe("");
    expect(result.rows[0][1]).toBe("value");
  });
});

describe("parseCsvPreview — defaults", () => {
  it("defaults maxRows to 50 and maxCols to 12", () => {
    const headers = Array.from({ length: 20 }, (_, i) => `col${i}`).join(",");
    const row = Array.from({ length: 20 }, (_, i) => String(i)).join(",");
    const rows = Array.from({ length: 60 }, () => row).join("\n");
    const csv = `${headers}\n${rows}\n`;
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.header.length).toBe(12);
    expect(result.rows.length).toBe(50);
  });

  it("totalRows counts all rows including header", () => {
    const csv = "h1,h2\nr1c1,r1c2\nr2c1,r2c2\nr3c1,r3c2\n";
    const result = parseCsvPreview(Buffer.from(csv));
    expect(result.totalRows).toBe(4);
  });
});

describe("formatCsvPreviewText — content shape", () => {
  it("contains totalRows count", () => {
    const csv = "a,b\n1,2\n3,4\n5,6\n";
    const preview = parseCsvPreview(Buffer.from(csv));
    const text = formatCsvPreviewText("data.csv", preview);
    expect(text).toContain(`rows: ${preview.totalRows}`);
  });

  it("contains columns count", () => {
    const csv = "a,b,c\n1,2,3\n";
    const preview = parseCsvPreview(Buffer.from(csv));
    const text = formatCsvPreviewText("data.csv", preview);
    expect(text).toContain("cols: 3");
  });

  it("contains markdown table in output", () => {
    const csv = "name,score\nAlice,100\n";
    const preview = parseCsvPreview(Buffer.from(csv));
    const text = formatCsvPreviewText("scores.csv", preview);
    expect(text).toContain(preview.markdownTable);
  });

  it("different filenames produce different outputs", () => {
    const preview = parseCsvPreview(Buffer.from("a\n1\n"));
    const t1 = formatCsvPreviewText("file1.csv", preview);
    const t2 = formatCsvPreviewText("file2.csv", preview);
    expect(t1).not.toBe(t2);
  });
});
