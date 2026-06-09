import { describe, it, expect } from "vitest";
import { fuzzySearch } from "./fuzzy-search";
import type { SearchItem } from "./fuzzy-search";

const items: SearchItem[] = [
  { id: "web-search", label: "Web Search" },
  { id: "calculator", label: "Calculator" },
  { id: "web-browser", label: "Web Browser" },
  { id: "file-manager", label: "File Manager" },
  { id: "code-editor", label: "Code Editor" },
];

describe("fuzzySearch — empty / trivial queries", () => {
  it("returns all items when query is empty", () => {
    expect(fuzzySearch(items, "")).toHaveLength(items.length);
  });

  it("returns all items when query is only whitespace", () => {
    expect(fuzzySearch(items, "   ")).toHaveLength(items.length);
  });

  it("returns empty array when items list is empty", () => {
    expect(fuzzySearch([], "web")).toHaveLength(0);
  });
});

describe("fuzzySearch — exact matches", () => {
  it("finds item by exact id substring", () => {
    const result = fuzzySearch(items, "web-search");
    expect(result.some((i) => i.id === "web-search")).toBe(true);
  });

  it("finds item by exact label substring", () => {
    const result = fuzzySearch(items, "Calculator");
    expect(result.some((i) => i.id === "calculator")).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = fuzzySearch(items, "CODE EDITOR");
    expect(result.some((i) => i.id === "code-editor")).toBe(true);
  });
});

describe("fuzzySearch — partial / fuzzy matches", () => {
  it("finds items with partial label match", () => {
    const result = fuzzySearch(items, "web");
    const ids = result.map((i) => i.id);
    expect(ids).toContain("web-search");
    expect(ids).toContain("web-browser");
  });

  it("puts higher-scoring exact matches first", () => {
    const result = fuzzySearch(items, "web-search");
    expect(result[0].id).toBe("web-search");
  });

  it("filters out unrelated items", () => {
    const result = fuzzySearch(items, "xyzxyz");
    expect(result).toHaveLength(0);
  });
});

describe("fuzzySearch — special characters stripped", () => {
  it("matches when query contains hyphens (stripped)", () => {
    const result = fuzzySearch(items, "file-man");
    expect(result.some((i) => i.id === "file-manager")).toBe(true);
  });

  it("matches when query contains spaces (stripped)", () => {
    const result = fuzzySearch(items, "code edit");
    expect(result.some((i) => i.id === "code-editor")).toBe(true);
  });
});

describe("fuzzySearch — single-character queries", () => {
  it("returns items with a single letter matching id or label", () => {
    const mini: SearchItem[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];
    const result = fuzzySearch(mini, "a");
    expect(result.some((i) => i.id === "a")).toBe(true);
  });
});

describe("fuzzySearch — result structure", () => {
  it("result items have id and label fields", () => {
    const result = fuzzySearch(items, "web");
    for (const item of result) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.label).toBe("string");
    }
  });

  it("does not return duplicates", () => {
    const result = fuzzySearch(items, "web");
    const ids = result.map((i) => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("returns a subset (not more than input)", () => {
    const result = fuzzySearch(items, "web");
    expect(result.length).toBeLessThanOrEqual(items.length);
  });
});

describe("fuzzySearch — label scoring", () => {
  it("finds Calculator when querying 'calc'", () => {
    const result = fuzzySearch(items, "calc");
    expect(result.some((i) => i.id === "calculator")).toBe(true);
  });

  it("finds File Manager when querying 'file'", () => {
    const result = fuzzySearch(items, "file");
    expect(result.some((i) => i.id === "file-manager")).toBe(true);
  });

  it("returns empty for query matching nothing", () => {
    expect(fuzzySearch(items, "zzzzz")).toHaveLength(0);
  });
});

describe("fuzzySearch — return type invariants", () => {
  const items: SearchItem[] = [
    { id: "x1", label: "Alpha" },
    { id: "x2", label: "Beta" },
  ];

  test("always returns an array", () => {
    expect(Array.isArray(fuzzySearch(items, ""))).toBe(true);
    expect(Array.isArray(fuzzySearch(items, "al"))).toBe(true);
    expect(Array.isArray(fuzzySearch(items, "zzz"))).toBe(true);
  });

  test("each result item has id and label", () => {
    const results = fuzzySearch(items, "a");
    for (const r of results) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("label");
    }
  });

  test("result items are a subset of input items", () => {
    const results = fuzzySearch(items, "bet");
    for (const r of results) {
      expect(items).toContainEqual(r);
    }
  });

  test("result with empty query has same length as input", () => {
    expect(fuzzySearch(items, "").length).toBe(items.length);
  });
});

describe("fuzzySearch — edge case invariants", () => {
  test("handles empty items array", () => {
    expect(fuzzySearch([], "anything")).toEqual([]);
  });

  test("handles single item array — match", () => {
    const items: SearchItem[] = [{ id: "s", label: "single" }];
    expect(fuzzySearch(items, "singl")).toContainEqual(items[0]);
  });

  test("handles single item array — no match", () => {
    const items: SearchItem[] = [{ id: "s", label: "single" }];
    expect(fuzzySearch(items, "zzz")).toHaveLength(0);
  });

  test("does not return duplicates", () => {
    const items: SearchItem[] = [
      { id: "a", label: "apple" },
      { id: "b", label: "apricot" },
    ];
    const results = fuzzySearch(items, "ap");
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("query with only spaces returns all items", () => {
    const items: SearchItem[] = [{ id: "a", label: "test" }];
    expect(fuzzySearch(items, "   ").length).toBe(items.length);
  });
});
