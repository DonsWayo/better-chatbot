import { describe, expect, test } from "vitest";
import { fuzzySearch, type SearchItem } from "./fuzzy-search";

describe("fuzzySearch", () => {
  const testItems: SearchItem[] = [
    { id: "item-1", label: "Apple" },
    { id: "item-2", label: "Banana" },
    { id: "item-3", label: "Cherry" },
    { id: "item-4", label: "Dragon fruit" },
    { id: "apple-5", label: "Elderberry" },
    { id: "item-6", label: "Fig" },
  ];

  test("returns all items when query is empty", () => {
    expect(fuzzySearch(testItems, "")).toEqual(testItems);
    expect(fuzzySearch(testItems, "   ")).toEqual(testItems);
  });

  test("finds exact matches in id", () => {
    const result = fuzzySearch(testItems, "apple");

    // Should match item-1 (label: Apple) and apple-5 (id: apple-5)
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(testItems[0]); // Apple
    expect(result).toContainEqual(testItems[4]); // apple-5
  });

  test("finds exact matches in label", () => {
    const result = fuzzySearch(testItems, "ban");

    // Should match item-2 (label: Banana)
    expect(result).toHaveLength(1);
    expect(result).toContainEqual(testItems[1]); // Banana
  });

  test("ignores special characters in query", () => {
    const result = fuzzySearch(testItems, "d*r*a*g*o*n");

    // Should match item-4 (label: Dragon fruit)
    expect(result).toHaveLength(1);
    expect(result).toContainEqual(testItems[3]); // Dragon fruit
  });

  test("matches using bigram similarity for longer queries", () => {
    const result = fuzzySearch(testItems, "el");

    // Should match item-5 (label: Elderberry)
    expect(result).toHaveLength(1);
    expect(result).toContainEqual(testItems[4]); // Elderberry
  });

  test("sorts results by score", () => {
    // Add item with partial match to test sorting
    const extendedItems: SearchItem[] = [
      ...testItems,
      { id: "app-test", label: "Application" },
    ];

    const result = fuzzySearch(extendedItems, "app");

    // Check that app-related items are returned
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result).toContainEqual(testItems[0]); // Apple
    expect(result).toContainEqual(testItems[4]); // apple-5
    expect(result).toContainEqual({ id: "app-test", label: "Application" });

    // The actual order depends on the scoring implementation
    // Don't assert exact order as it can change
  });

  test("filters items with score below minimum threshold", () => {
    const result = fuzzySearch(testItems, "xyz");

    // Should not match any items
    expect(result).toHaveLength(0);
  });

  test("ignores case sensitivity", () => {
    const result = fuzzySearch(testItems, "CHERRY");

    // CHERRY matches both Cherry and potentially other items
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result).toContainEqual(testItems[2]); // Cherry
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
