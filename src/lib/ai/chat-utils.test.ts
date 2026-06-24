/**
 * Deep unit tests for chat message utilities.
 *
 * Covers pure functions (no side-effects, no external deps) from:
 *  - src/lib/utils.ts
 *  - src/lib/ai/prompts.ts
 *  - src/lib/ai/file-support.ts
 *  - src/lib/fuzzy-search.ts
 *  - src/lib/equal.ts
 *  - src/lib/errors.ts
 *  - src/lib/memory/turn-indicator.ts
 *  - src/lib/memory/policy.ts   (pure helpers only)
 */

import { describe, expect, it } from "vitest";

// ── utils.ts ────────────────────────────────────────────────────────────────

import {
  capitalizeFirstLetter,
  cleanVariableName,
  createIncrement,
  deduplicateByKey,
  errorToString,
  exclude,
  generateUUID,
  generateUniqueKey,
  groupBy,
  isFunction,
  isJson,
  isNull,
  isObject,
  isPromiseLike,
  isString,
  objectFlow,
  parseEnvBoolean,
  safeJSONParse,
  truncateString,
} from "../utils";

// ── prompts.ts ───────────────────────────────────────────────────────────────

import { sanitizeTitle } from "./prompts";

// ── file-support.ts ──────────────────────────────────────────────────────────

import { isFilePartSupported, isIngestSupported } from "./file-support";

// ── fuzzy-search.ts ──────────────────────────────────────────────────────────

import { fuzzySearch } from "../fuzzy-search";

// ── equal.ts ─────────────────────────────────────────────────────────────────

import equal from "../equal";

// ── errors.ts ────────────────────────────────────────────────────────────────

import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
  extractApiErrorMessage,
} from "../errors";

// ── memory/turn-indicator.ts ─────────────────────────────────────────────────

import {
  countNewMemories,
  isTurnActiveStatus,
  turnJustCompleted,
} from "../memory/turn-indicator";

// ── memory/policy.ts (pure helpers only) ─────────────────────────────────────

import {
  DEFAULT_MEMORY_POLICY,
  isMemoryMode,
  resolveMemoryLayers,
  teamMemoryEnabledKey,
  teamMemoryImplicitExtractionKey,
} from "../memory/policy";

// ═══════════════════════════════════════════════════════════════════════════
//  capitalizeFirstLetter
// ═══════════════════════════════════════════════════════════════════════════

describe("capitalizeFirstLetter", () => {
  it("capitalizes a lowercase letter", () => {
    expect(capitalizeFirstLetter("hello")).toBe("Hello");
  });

  it("leaves an already-capitalized string unchanged", () => {
    expect(capitalizeFirstLetter("World")).toBe("World");
  });

  it("handles a single character", () => {
    expect(capitalizeFirstLetter("a")).toBe("A");
  });

  it("handles an already-uppercase single character", () => {
    expect(capitalizeFirstLetter("A")).toBe("A");
  });

  it("returns empty string for empty input", () => {
    expect(capitalizeFirstLetter("")).toBe("");
  });

  it("handles a string with a digit at the start", () => {
    expect(capitalizeFirstLetter("1hello")).toBe("1hello");
  });

  it("only capitalizes the first character, not the rest", () => {
    expect(capitalizeFirstLetter("hELLO")).toBe("HELLO");
  });

  it("handles unicode emoji as first char without crashing", () => {
    const result = capitalizeFirstLetter("😀 hi");
    expect(typeof result).toBe("string");
    expect(result).toContain("hi");
  });

  it("handles RTL text (Arabic)", () => {
    const result = capitalizeFirstLetter("مرحبا");
    expect(typeof result).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  truncateString
// ═══════════════════════════════════════════════════════════════════════════

describe("truncateString", () => {
  it("returns string unchanged when at or below maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when over maxLength", () => {
    expect(truncateString("hello world", 5)).toBe("hello...");
  });

  it("handles maxLength of 0", () => {
    expect(truncateString("hello", 0)).toBe("...");
  });

  it("handles empty string", () => {
    expect(truncateString("", 10)).toBe("");
    expect(truncateString("", 0)).toBe("");
  });

  it("handles a very long string with unicode", () => {
    const long = "a".repeat(1000) + "🚀";
    expect(truncateString(long, 10)).toBe("a".repeat(10) + "...");
  });

  it("handles maxLength exactly at string boundary", () => {
    expect(truncateString("abc", 3)).toBe("abc");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  cleanVariableName
// ═══════════════════════════════════════════════════════════════════════════

describe("cleanVariableName", () => {
  it("returns empty string for empty input", () => {
    expect(cleanVariableName("")).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(cleanVariableName(undefined)).toBe("");
  });

  it("strips special characters", () => {
    expect(cleanVariableName("hello world!")).toBe("helloworld");
  });

  it("strips leading digits", () => {
    expect(cleanVariableName("123abc")).toBe("abc");
  });

  it("preserves underscores and word chars", () => {
    expect(cleanVariableName("valid_name_123")).toBe("valid_name_123");
  });

  it("preserves unicode word chars (above 0x80)", () => {
    const result = cleanVariableName("héllo");
    // h, l, l, o are kept; é (>0x80) is also kept
    expect(result).toContain("h");
    expect(result).toContain("ll");
  });

  it("preserves hyphens (allowed by the regex)", () => {
    // cleanVariableName uses /[^\w-￿-]/g — the trailing - in the
    // character class is a literal hyphen, so hyphens are kept, not stripped.
    expect(cleanVariableName("my-var")).toBe("my-var");
  });

  it("handles a string that is entirely digits", () => {
    expect(cleanVariableName("999")).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  isString / isFunction / isObject / isNull / isPromiseLike / isJson
// ═══════════════════════════════════════════════════════════════════════════

describe("type guards", () => {
  describe("isString", () => {
    it("returns true for strings", () => {
      expect(isString("hello")).toBe(true);
      expect(isString("")).toBe(true);
    });

    it("returns false for non-strings", () => {
      expect(isString(42)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe("isFunction", () => {
    it("returns true for arrow functions", () => {
      expect(isFunction(() => {})).toBe(true);
    });

    it("returns true for regular functions", () => {
      expect(isFunction(function () {})).toBe(true);
    });

    it("returns false for non-functions", () => {
      expect(isFunction("hello")).toBe(false);
      expect(isFunction(42)).toBe(false);
      expect(isFunction(null)).toBe(false);
    });
  });

  describe("isObject", () => {
    it("returns true for plain objects", () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: "value" })).toBe(true);
    });

    it("returns true for arrays (objects in JS)", () => {
      expect(isObject([])).toBe(true);
    });

    it("returns false for primitives", () => {
      expect(isObject("string")).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject(null)).toBe(false);
    });
  });

  describe("isNull", () => {
    it("returns true for null and undefined", () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(true);
    });

    it("returns false for falsy non-null values", () => {
      expect(isNull(0)).toBe(false);
      expect(isNull("")).toBe(false);
      expect(isNull(false)).toBe(false);
    });
  });

  describe("isPromiseLike", () => {
    it("returns true for actual promises", () => {
      expect(isPromiseLike(Promise.resolve())).toBe(true);
    });

    it("returns true for thenable objects", () => {
      expect(isPromiseLike({ then: () => {} })).toBe(true);
    });

    it("returns false for non-thenables", () => {
      expect(isPromiseLike(null)).toBe(false);
      expect(isPromiseLike({})).toBe(false);
      expect(isPromiseLike("promise")).toBe(false);
    });
  });

  describe("isJson", () => {
    it("returns true for valid JSON strings", () => {
      expect(isJson('{"key":"value"}')).toBe(true);
      expect(isJson("[1,2,3]")).toBe(true);
    });

    it("returns true for plain objects", () => {
      expect(isJson({ key: "value" })).toBe(true);
    });

    it("returns false for invalid JSON strings", () => {
      expect(isJson("{not valid}")).toBe(false);
      expect(isJson("just a string")).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isJson(42)).toBe(false);
      expect(isJson(null)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  safeJSONParse
// ═══════════════════════════════════════════════════════════════════════════

describe("safeJSONParse", () => {
  it("parses valid JSON and returns success=true", () => {
    const result = safeJSONParse<{ a: number }>('{"a":1}');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual({ a: 1 });
  });

  it("returns success=false for invalid JSON", () => {
    const result = safeJSONParse("{invalid}");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("parses arrays", () => {
    const result = safeJSONParse<number[]>("[1,2,3]");
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([1, 2, 3]);
  });

  it("handles empty string gracefully", () => {
    const result = safeJSONParse("");
    expect(result.success).toBe(false);
  });

  it("parses nested objects", () => {
    const result = safeJSONParse<{ a: { b: string } }>('{"a":{"b":"x"}}');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.a.b).toBe("x");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  generateUUID
// ═══════════════════════════════════════════════════════════════════════════

describe("generateUUID", () => {
  it("returns a string of the correct UUID v4 format", () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns unique values each call", () => {
    const ids = new Set(Array.from({ length: 100 }, generateUUID));
    expect(ids.size).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  parseEnvBoolean
// ═══════════════════════════════════════════════════════════════════════════

describe("parseEnvBoolean", () => {
  it("parses 'true' string", () => {
    expect(parseEnvBoolean("true")).toBe(true);
    expect(parseEnvBoolean("TRUE")).toBe(true);
  });

  it("parses '1' string", () => {
    expect(parseEnvBoolean("1")).toBe(true);
  });

  it("parses 'y' string", () => {
    expect(parseEnvBoolean("y")).toBe(true);
  });

  it("parses 'false' string", () => {
    expect(parseEnvBoolean("false")).toBe(false);
  });

  it("parses '0' string", () => {
    expect(parseEnvBoolean("0")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(parseEnvBoolean(undefined)).toBe(false);
  });

  it("passes boolean true through", () => {
    expect(parseEnvBoolean(true)).toBe(true);
  });

  it("passes boolean false through", () => {
    expect(parseEnvBoolean(false)).toBe(false);
  });

  it("returns false for unrecognised strings", () => {
    expect(parseEnvBoolean("yes")).toBe(false);
    expect(parseEnvBoolean("on")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  groupBy
// ═══════════════════════════════════════════════════════════════════════════

describe("groupBy", () => {
  it("groups by a key property", () => {
    const items = [
      { id: "1", role: "user" },
      { id: "2", role: "assistant" },
      { id: "3", role: "user" },
    ];
    const result = groupBy(items, "role");
    expect(result["user"]).toHaveLength(2);
    expect(result["assistant"]).toHaveLength(1);
  });

  it("groups by a function", () => {
    const items = [1, 2, 3, 4, 5];
    const result = groupBy(items as any, (n: any) =>
      n % 2 === 0 ? "even" : "odd",
    );
    expect(result["even"]).toEqual([2, 4]);
    expect(result["odd"]).toEqual([1, 3, 5]);
  });

  it("returns an empty object for an empty array", () => {
    expect(groupBy([], "id" as any)).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  createIncrement
// ═══════════════════════════════════════════════════════════════════════════

describe("createIncrement", () => {
  it("starts at 0 by default and increments", () => {
    const inc = createIncrement();
    expect(inc()).toBe(0);
    expect(inc()).toBe(1);
    expect(inc()).toBe(2);
  });

  it("starts at a custom value", () => {
    const inc = createIncrement(10);
    expect(inc()).toBe(10);
    expect(inc()).toBe(11);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  deduplicateByKey
// ═══════════════════════════════════════════════════════════════════════════

describe("deduplicateByKey", () => {
  it("removes duplicates keeping first occurrence", () => {
    const arr = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "a", value: 3 },
    ];
    const result = deduplicateByKey(arr, "id");
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(1); // first occurrence preserved
  });

  it("returns original array when no duplicates", () => {
    const arr = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ];
    expect(deduplicateByKey(arr, "id")).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateByKey([], "id" as any)).toEqual([]);
  });

  it("handles all-duplicate array", () => {
    const arr = [
      { id: "x", v: 1 },
      { id: "x", v: 2 },
      { id: "x", v: 3 },
    ];
    const result = deduplicateByKey(arr, "id");
    expect(result).toHaveLength(1);
    expect(result[0].v).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  errorToString
// ═══════════════════════════════════════════════════════════════════════════

describe("errorToString", () => {
  it("returns 'unknown error' for null", () => {
    expect(errorToString(null)).toBe("unknown error");
  });

  it("returns 'unknown error' for undefined", () => {
    expect(errorToString(undefined)).toBe("unknown error");
  });

  it("returns the string directly for string input", () => {
    expect(errorToString("something went wrong")).toBe("something went wrong");
  });

  it("returns message for Error instances", () => {
    expect(errorToString(new Error("boom"))).toBe("boom");
  });

  it("JSON-stringifies unknown objects", () => {
    const result = errorToString({ code: 404 });
    expect(result).toContain("404");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  exclude
// ═══════════════════════════════════════════════════════════════════════════

describe("exclude", () => {
  it("removes specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = exclude(obj, ["b"]);
    expect(result).toEqual({ a: 1, c: 3 });
    expect("b" in result).toBe(false);
  });

  it("returns unchanged object when excluding nonexistent keys", () => {
    const obj = { a: 1 };
    const result = exclude(obj, ["z" as any]);
    expect(result).toEqual({ a: 1 });
  });

  it("returns empty object when all keys are excluded", () => {
    const obj = { a: 1, b: 2 };
    expect(exclude(obj, ["a", "b"])).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  generateUniqueKey
// ═══════════════════════════════════════════════════════════════════════════

describe("generateUniqueKey", () => {
  it("returns the key unchanged when not in existingKeys", () => {
    expect(generateUniqueKey("foo", [])).toBe("foo");
    expect(generateUniqueKey("foo", ["bar", "baz"])).toBe("foo");
  });

  it("appends a counter when the key already exists", () => {
    expect(generateUniqueKey("foo", ["foo"])).toBe("foo1");
  });

  it("increments counter until unique", () => {
    expect(generateUniqueKey("foo", ["foo", "foo1", "foo2"])).toBe("foo3");
  });

  it("handles a key that ends with digits (has original number)", () => {
    // key = "foo1", existingKeys includes "foo1"  → should produce "foo2"
    expect(generateUniqueKey("foo1", ["foo1"])).toBe("foo2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  objectFlow helpers
// ═══════════════════════════════════════════════════════════════════════════

describe("objectFlow", () => {
  const base = { a: 1, b: 2, c: 3 };

  it("map transforms values", () => {
    const result = objectFlow(base).map((v) => v * 2);
    expect(result).toEqual({ a: 2, b: 4, c: 6 });
  });

  it("filter keeps matching keys", () => {
    const result = objectFlow(base).filter((v) => v > 1);
    expect(result).toEqual({ b: 2, c: 3 });
  });

  it("some returns true when predicate matches at least one entry", () => {
    expect(objectFlow(base).some((v) => v === 2)).toBe(true);
  });

  it("some returns false when no entry matches", () => {
    expect(objectFlow(base).some((v) => v > 100)).toBe(false);
  });

  it("every returns true when all entries match", () => {
    expect(objectFlow(base).every((v) => v > 0)).toBe(true);
  });

  it("every returns false when some entries don't match", () => {
    expect(objectFlow(base).every((v) => v > 1)).toBe(false);
  });

  it("getByPath retrieves a nested value", () => {
    const nested = { x: { y: { z: 42 } } };
    expect(objectFlow(nested).getByPath<number>(["x", "y", "z"])).toBe(42);
  });

  it("getByPath returns undefined for a missing path", () => {
    expect(objectFlow(base).getByPath(["nonexistent"])).toBeUndefined();
  });

  it("setByPath sets a nested value", () => {
    const target = { x: { y: 1 } };
    objectFlow(target).setByPath(["x", "y"], 99);
    expect(target.x.y).toBe(99);
  });

  it("setByPath creates intermediate objects", () => {
    const target: any = {};
    objectFlow(target).setByPath(["a", "b"], "hello");
    expect(target.a.b).toBe("hello");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  sanitizeTitle  (prompts.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("sanitizeTitle", () => {
  it("returns a clean title when the model produces a good one", () => {
    expect(sanitizeTitle("TypeScript Generics", "first message")).toBe(
      "TypeScript Generics",
    );
  });

  it("trims whitespace from title", () => {
    expect(sanitizeTitle("  React Hooks  ", "first message")).toBe(
      "React Hooks",
    );
  });

  it("falls back to firstUserMessage when title contains 'sorry'", () => {
    const result = sanitizeTitle(
      "I'm sorry, I cannot help",
      "Tell me about React",
    );
    expect(result).toBe("Tell me about React");
  });

  it("falls back when title contains 'cannot'", () => {
    const result = sanitizeTitle("cannot assist with that", "What is AI?");
    expect(result).toBe("What is AI?");
  });

  it("falls back when title contains 'unable'", () => {
    const result = sanitizeTitle("I am unable to help", "Debug my code");
    expect(result).toBe("Debug my code");
  });

  it("falls back to 'New Chat' when both title and firstUserMessage are empty", () => {
    expect(sanitizeTitle("", "")).toBe("New Chat");
  });

  it("falls back to 'New Chat' when title is a refusal and message is whitespace", () => {
    expect(sanitizeTitle("sorry", "   ")).toBe("New Chat");
  });

  it("hard-caps the title at 80 characters", () => {
    const longTitle = "a".repeat(100);
    expect(sanitizeTitle(longTitle, "fallback")).toHaveLength(80);
  });

  it("hard-caps the fallback message at 80 characters", () => {
    const longMessage = "b".repeat(200);
    const result = sanitizeTitle("sorry", longMessage);
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it("preserves case (does not lowercase title)", () => {
    expect(sanitizeTitle("JavaScript Async/Await", "msg")).toBe(
      "JavaScript Async/Await",
    );
  });

  it("collapses whitespace in firstUserMessage for fallback", () => {
    const result = sanitizeTitle("sorry", "hello    world");
    expect(result).toBe("hello world");
  });

  it("handles unicode in title correctly", () => {
    const result = sanitizeTitle("学习编程", "Chinese message");
    expect(result).toBe("学习编程");
  });

  it("handles emoji-heavy title without crashing", () => {
    const emojiTitle = "🚀 " + "a".repeat(10);
    const result = sanitizeTitle(emojiTitle, "fallback");
    expect(typeof result).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  isFilePartSupported / isIngestSupported  (file-support.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("isFilePartSupported", () => {
  it("returns true for image/jpeg by default", () => {
    expect(isFilePartSupported("image/jpeg")).toBe(true);
  });

  it("returns true for image/png by default", () => {
    expect(isFilePartSupported("image/png")).toBe(true);
  });

  it("returns true for application/pdf by default", () => {
    expect(isFilePartSupported("application/pdf")).toBe(true);
  });

  it("returns false for text/csv (not in default set)", () => {
    expect(isFilePartSupported("text/csv")).toBe(false);
  });

  it("returns false for undefined mime", () => {
    expect(isFilePartSupported(undefined)).toBe(false);
  });

  it("uses the provided supportedMimeTypes list when given", () => {
    expect(isFilePartSupported("text/plain", ["text/plain"])).toBe(true);
    expect(isFilePartSupported("image/jpeg", ["text/plain"])).toBe(false);
  });

  it("returns false when supportedMimeTypes is an empty array", () => {
    expect(isFilePartSupported("image/jpeg", [])).toBe(false);
  });
});

describe("isIngestSupported", () => {
  it("returns true for text/csv", () => {
    expect(isIngestSupported("text/csv")).toBe(true);
  });

  it("returns true for application/csv", () => {
    expect(isIngestSupported("application/csv")).toBe(true);
  });

  it("returns false for image/jpeg", () => {
    expect(isIngestSupported("image/jpeg")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isIngestSupported(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isIngestSupported("")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  fuzzySearch  (fuzzy-search.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("fuzzySearch", () => {
  const items = [
    { id: "react-hooks", label: "React Hooks Guide" },
    { id: "typescript-generics", label: "TypeScript Generics" },
    { id: "css-grid", label: "CSS Grid Layout" },
    { id: "nextjs-routing", label: "Next.js Routing" },
  ];

  it("returns all items when query is empty", () => {
    expect(fuzzySearch(items, "")).toHaveLength(4);
  });

  it("returns all items when query is whitespace only", () => {
    expect(fuzzySearch(items, "   ")).toHaveLength(4);
  });

  it("finds an exact label match", () => {
    const results = fuzzySearch(items, "TypeScript");
    expect(results[0].id).toBe("typescript-generics");
  });

  it("finds a partial id match", () => {
    const results = fuzzySearch(items, "react");
    expect(results.some((r) => r.id === "react-hooks")).toBe(true);
  });

  it("returns results ordered by relevance (exact match first)", () => {
    const results = fuzzySearch(items, "css");
    expect(results[0].id).toBe("css-grid");
  });

  it("returns empty array when no item matches at all", () => {
    const results = fuzzySearch(items, "zzzzzzz");
    expect(results).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const results = fuzzySearch(items, "REACT");
    expect(results.some((r) => r.id === "react-hooks")).toBe(true);
  });

  it("handles special characters in query without crashing", () => {
    expect(() => fuzzySearch(items, "!@#$%")).not.toThrow();
  });

  it("returns empty array for an empty items list", () => {
    expect(fuzzySearch([], "react")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  equal  (equal.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("equal (deep equality)", () => {
  it("compares primitives correctly", () => {
    expect(equal(1, 1)).toBe(true);
    expect(equal(1, 2)).toBe(false);
    expect(equal("a", "a")).toBe(true);
    expect(equal("a", "b")).toBe(false);
  });

  it("handles NaN equality", () => {
    expect(equal(NaN, NaN)).toBe(true);
  });

  it("handles null and undefined", () => {
    expect(equal(null, null)).toBe(true);
    expect(equal(undefined, undefined)).toBe(true);
    expect(equal(null, undefined)).toBe(false);
  });

  it("compares plain objects deeply", () => {
    expect(equal({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(equal({ a: 1 }, { a: 2 })).toBe(false);
    expect(equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compares nested objects deeply", () => {
    expect(equal({ a: { b: { c: 3 } } }, { a: { b: { c: 3 } } })).toBe(true);
    expect(equal({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it("compares arrays deeply", () => {
    expect(equal([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(equal([1, 2], [1, 2, 3])).toBe(false);
    expect(equal([1, [2, 3]], [1, [2, 3]])).toBe(true);
  });

  it("compares Date objects by value", () => {
    const d1 = new Date("2024-01-01");
    const d2 = new Date("2024-01-01");
    const d3 = new Date("2024-06-01");
    expect(equal(d1, d2)).toBe(true);
    expect(equal(d1, d3)).toBe(false);
  });

  it("compares RegExp objects", () => {
    expect(equal(/abc/gi, /abc/gi)).toBe(true);
    expect(equal(/abc/, /def/)).toBe(false);
    expect(equal(/abc/g, /abc/i)).toBe(false);
  });

  it("compares Map objects", () => {
    const m1 = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const m2 = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const m3 = new Map([["a", 1]]);
    expect(equal(m1, m2)).toBe(true);
    expect(equal(m1, m3)).toBe(false);
  });

  it("compares Set objects", () => {
    const s1 = new Set([1, 2, 3]);
    const s2 = new Set([1, 2, 3]);
    const s3 = new Set([1, 2]);
    expect(equal(s1, s2)).toBe(true);
    expect(equal(s1, s3)).toBe(false);
  });

  it("returns false when comparing object to array", () => {
    expect(equal({}, [])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  AppError / UnauthorizedError / ForbiddenError  (errors.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("AppError hierarchy", () => {
  it("AppError stores code and message", () => {
    const err = new AppError("MY_CODE", "my message");
    expect(err.code).toBe("MY_CODE");
    expect(err.message).toBe("my message");
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });

  it("UnauthorizedError has correct defaults", () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.name).toBe("UnauthorizedError");
  });

  it("UnauthorizedError accepts custom message", () => {
    const err = new UnauthorizedError("Please log in");
    expect(err.message).toBe("Please log in");
  });

  it("ForbiddenError has correct defaults", () => {
    const err = new ForbiddenError();
    expect(err.code).toBe("FORBIDDEN");
    expect(err.name).toBe("ForbiddenError");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  extractApiErrorMessage  (errors.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("extractApiErrorMessage", () => {
  it("returns empty string for null/undefined", () => {
    expect(extractApiErrorMessage(null)).toBe("");
    expect(extractApiErrorMessage(undefined)).toBe("");
  });

  it("extracts .message from a JSON string", () => {
    expect(extractApiErrorMessage('{"message":"Budget exhausted"}')).toBe(
      "Budget exhausted",
    );
  });

  it("extracts .message from an object", () => {
    expect(extractApiErrorMessage({ message: "rate limit hit" })).toBe(
      "rate limit hit",
    );
  });

  it("extracts .error string from object when .message absent", () => {
    expect(extractApiErrorMessage({ error: "not_found" })).toBe("not_found");
  });

  it("recurses into .error object", () => {
    expect(extractApiErrorMessage({ error: { message: "inner error" } })).toBe(
      "inner error",
    );
  });

  it("returns raw string when it's not JSON", () => {
    expect(extractApiErrorMessage("plain text")).toBe("plain text");
  });

  it("returns raw string when JSON does not start with { or [", () => {
    // A JSON number — not an object or array prefix
    expect(extractApiErrorMessage("42")).toBe("42");
  });

  it("returns raw string when JSON fails to parse", () => {
    const bad = "{bad json}";
    expect(extractApiErrorMessage(bad)).toBe(bad);
  });

  it("handles nested JSON string wrapping an object", () => {
    const result = extractApiErrorMessage('{"error":{"message":"nested"}}');
    expect(result).toBe("nested");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  isTurnActiveStatus / turnJustCompleted / countNewMemories
//  (memory/turn-indicator.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("isTurnActiveStatus", () => {
  it("returns true for 'submitted'", () => {
    expect(isTurnActiveStatus("submitted")).toBe(true);
  });

  it("returns true for 'streaming'", () => {
    expect(isTurnActiveStatus("streaming")).toBe(true);
  });

  it("returns false for 'ready'", () => {
    expect(isTurnActiveStatus("ready")).toBe(false);
  });

  it("returns false for 'idle'", () => {
    expect(isTurnActiveStatus("idle")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isTurnActiveStatus("")).toBe(false);
  });
});

describe("turnJustCompleted", () => {
  it("returns true when transitioning from 'submitted' to 'ready'", () => {
    expect(turnJustCompleted("submitted", "ready")).toBe(true);
  });

  it("returns true when transitioning from 'streaming' to 'ready'", () => {
    expect(turnJustCompleted("streaming", "ready")).toBe(true);
  });

  it("returns false when next is not 'ready'", () => {
    expect(turnJustCompleted("submitted", "streaming")).toBe(false);
  });

  it("returns false when prev is not active", () => {
    expect(turnJustCompleted("ready", "ready")).toBe(false);
    expect(turnJustCompleted("idle", "ready")).toBe(false);
  });

  it("returns false when prev === next (no actual transition)", () => {
    expect(turnJustCompleted("ready", "ready")).toBe(false);
  });
});

describe("countNewMemories", () => {
  it("returns 0 for null", () => {
    expect(countNewMemories(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(countNewMemories(undefined)).toBe(0);
  });

  it("returns 0 for a non-object primitive", () => {
    expect(countNewMemories(42)).toBe(0);
    expect(countNewMemories("string")).toBe(0);
  });

  it("returns 0 when .memories is absent", () => {
    expect(countNewMemories({})).toBe(0);
  });

  it("returns 0 when .memories is not an array", () => {
    expect(countNewMemories({ memories: "not-array" })).toBe(0);
    expect(countNewMemories({ memories: null })).toBe(0);
  });

  it("returns the length of the .memories array", () => {
    expect(countNewMemories({ memories: ["a", "b", "c"] })).toBe(3);
  });

  it("returns 0 for an empty .memories array", () => {
    expect(countNewMemories({ memories: [] })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  isMemoryMode / teamMemoryEnabledKey / teamMemoryImplicitExtractionKey /
//  resolveMemoryLayers  (memory/policy.ts — pure helpers)
// ═══════════════════════════════════════════════════════════════════════════

describe("isMemoryMode", () => {
  it("returns true for valid modes", () => {
    expect(isMemoryMode("on")).toBe(true);
    expect(isMemoryMode("paused")).toBe(true);
    expect(isMemoryMode("off")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isMemoryMode("enabled")).toBe(false);
    expect(isMemoryMode("")).toBe(false);
    expect(isMemoryMode(null)).toBe(false);
    expect(isMemoryMode(undefined)).toBe(false);
    expect(isMemoryMode(1)).toBe(false);
  });
});

describe("teamMemoryEnabledKey", () => {
  it("prefixes the teamId correctly", () => {
    expect(teamMemoryEnabledKey("team-123")).toBe(
      "team_memory_enabled:team-123",
    );
  });

  it("handles a UUID teamId", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(teamMemoryEnabledKey(uuid)).toBe(`team_memory_enabled:${uuid}`);
  });
});

describe("teamMemoryImplicitExtractionKey", () => {
  it("prefixes the teamId correctly", () => {
    expect(teamMemoryImplicitExtractionKey("team-abc")).toBe(
      "team_memory_implicit_extraction:team-abc",
    );
  });
});

describe("resolveMemoryLayers", () => {
  const defaults = DEFAULT_MEMORY_POLICY; // { enabled: true, implicitExtraction: false }

  it("returns defaults when org and team are both empty", () => {
    expect(resolveMemoryLayers(defaults, {}, undefined)).toEqual({
      enabled: true,
      implicitExtraction: false,
    });
  });

  it("org override wins over default", () => {
    const result = resolveMemoryLayers(
      defaults,
      { enabled: false, implicitExtraction: true },
      undefined,
    );
    expect(result.enabled).toBe(false);
    expect(result.implicitExtraction).toBe(true);
  });

  it("team override wins over org override", () => {
    const result = resolveMemoryLayers(
      defaults,
      { enabled: false, implicitExtraction: false },
      { enabled: true, implicitExtraction: true },
    );
    expect(result.enabled).toBe(true);
    expect(result.implicitExtraction).toBe(true);
  });

  it("null team layer falls through to org layer", () => {
    const result = resolveMemoryLayers(
      defaults,
      { enabled: false },
      { enabled: null },
    );
    expect(result.enabled).toBe(false); // org value used when team is null
  });

  it("undefined team parameter is ignored (falls through to org/default)", () => {
    const result = resolveMemoryLayers(defaults, { enabled: false });
    expect(result.enabled).toBe(false);
  });

  it("partial org override keeps non-overridden keys at default", () => {
    const result = resolveMemoryLayers(defaults, { enabled: false });
    expect(result.implicitExtraction).toBe(false); // default preserved
  });

  it("is a pure function — does not mutate defaults", () => {
    const orig = { ...defaults };
    resolveMemoryLayers(defaults, { enabled: false }, { enabled: true });
    expect(defaults).toEqual(orig);
  });
});
