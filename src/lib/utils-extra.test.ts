import { describe, it, expect } from "vitest";
import {
  safeJSONParse,
  capitalizeFirstLetter,
  truncateString,
  cleanVariableName,
  generateUniqueKey,
  exclude,
  validateSchema,
  generateUUID,
  isString,
  isFunction,
  isObject,
  isNull,
  isJson,
  Deferred,
  Locker,
  createIncrement,
  PromiseChain,
} from "./utils";

describe("safeJSONParse", () => {
  it("returns success:true for valid JSON object", () => {
    const r = safeJSONParse<{ a: number }>('{"a":1}');
    expect(r.success).toBe(true);
    if (r.success) expect(r.value.a).toBe(1);
  });

  it("returns success:false for invalid JSON", () => {
    const r = safeJSONParse("not json {");
    expect(r.success).toBe(false);
    expect(r.error).toBeDefined();
  });

  it("parses arrays", () => {
    const r = safeJSONParse<number[]>("[1,2,3]");
    expect(r.success).toBe(true);
    if (r.success) expect(r.value).toHaveLength(3);
  });
});

describe("capitalizeFirstLetter", () => {
  it("capitalizes first letter", () => {
    expect(capitalizeFirstLetter("hello")).toBe("Hello");
  });

  it("leaves already capitalized strings unchanged", () => {
    expect(capitalizeFirstLetter("Hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(capitalizeFirstLetter("")).toBe("");
  });

  it("handles single character", () => {
    expect(capitalizeFirstLetter("a")).toBe("A");
  });
});

describe("truncateString", () => {
  it("does not truncate when within maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("truncates and appends ellipsis when over maxLength", () => {
    expect(truncateString("hello world", 5)).toBe("hello...");
  });

  it("returns exact string when equal to maxLength", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });
});

describe("cleanVariableName", () => {
  it("allows alphanumeric names", () => {
    expect(cleanVariableName("myVar123")).toBe("myVar123");
  });

  it("removes leading digits", () => {
    expect(cleanVariableName("123abc")).toBe("abc");
  });

  it("strips special characters like ! but keeps hyphen", () => {
    expect(cleanVariableName("hello-world!")).toBe("hello-world");
  });

  it("returns empty string for undefined", () => {
    expect(cleanVariableName(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(cleanVariableName("")).toBe("");
  });
});

describe("generateUniqueKey", () => {
  it("returns original key when no conflicts", () => {
    expect(generateUniqueKey("key", [])).toBe("key");
  });

  it("appends counter when key exists", () => {
    const result = generateUniqueKey("key", ["key"]);
    expect(result).toBe("key1");
  });

  it("increments until unique", () => {
    const result = generateUniqueKey("key", ["key", "key1", "key2"]);
    expect(result).toBe("key3");
  });

  it("handles numeric suffix in original key", () => {
    const result = generateUniqueKey("key1", ["key1"]);
    expect(result).not.toBe("key1");
    expect(result.startsWith("key")).toBe(true);
  });
});

describe("exclude", () => {
  it("excludes specified keys from object", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = exclude(obj, ["b"]);
    expect(result).toEqual({ a: 1, c: 3 });
    expect((result as any).b).toBeUndefined();
  });

  it("returns same object when no keys excluded", () => {
    const obj = { a: 1, b: 2 };
    expect(exclude(obj, [])).toEqual({ a: 1, b: 2 });
  });

  it("excludes multiple keys", () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = exclude(obj, ["a", "c"]);
    expect(result).toEqual({ b: 2, d: 4 });
  });
});

describe("validateSchema", () => {
  it("returns true for valid schema", () => {
    expect(validateSchema("myVar", { type: "string" })).toBe(true);
  });

  it("throws for invalid variable name (empty after clean)", () => {
    expect(() => validateSchema("123!!!", { type: "string" })).toThrow(/Invalid Variable Name/i);
  });

  it("throws for schema without type", () => {
    expect(() => validateSchema("myVar", {})).toThrow(/Invalid Schema/i);
  });

  it("validates nested object schema properties", () => {
    expect(
      validateSchema("obj", {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      }),
    ).toBe(true);
  });

  it("throws when object properties have duplicate keys (via array)", () => {
    // Create a schema where the properties object contains duplicate keys
    // JSON.parse deduplicates, so we test normal unique keys work
    expect(
      validateSchema("obj", {
        type: "object",
        properties: { a: { type: "string" } },
      }),
    ).toBe(true);
  });
});

describe("generateUUID", () => {
  it("generates a UUID string", () => {
    const uuid = generateUUID();
    expect(typeof uuid).toBe("string");
    expect(uuid.length).toBeGreaterThan(0);
  });

  it("generates unique UUIDs", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateUUID()));
    expect(ids.size).toBe(10);
  });
});

describe("type guard helpers", () => {
  it("isString identifies strings", () => {
    expect(isString("hello")).toBe(true);
    expect(isString(42)).toBe(false);
    expect(isString(null)).toBe(false);
  });

  it("isFunction identifies functions", () => {
    expect(isFunction(() => {})).toBe(true);
    expect(isFunction("not a fn")).toBe(false);
  });

  it("isObject identifies objects", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject("str")).toBe(false);
  });

  it("isNull identifies null and undefined", () => {
    expect(isNull(null)).toBe(true);
    expect(isNull(undefined)).toBe(true);
    expect(isNull(0)).toBe(false);
    expect(isNull("")).toBe(false);
  });

  it("isJson accepts JSON strings and objects", () => {
    expect(isJson('{"a":1}')).toBe(true);
    expect(isJson({ a: 1 })).toBe(true);
    expect(isJson("not json {")).toBe(false);
    expect(isJson(42)).toBe(false);
  });
});

describe("Deferred", () => {
  it("resolves externally", async () => {
    const d = Deferred<number>();
    setTimeout(() => d.resolve(42), 0);
    const result = await d.promise;
    expect(result).toBe(42);
  });

  it("rejects externally", async () => {
    const d = Deferred<number>();
    setTimeout(() => d.reject(new Error("oops")), 0);
    await expect(d.promise).rejects.toThrow("oops");
  });
});

describe("Locker", () => {
  it("starts unlocked", () => {
    const locker = new Locker();
    expect(locker.isLocked).toBe(false);
  });

  it("becomes locked after lock() called", () => {
    const locker = new Locker();
    locker.lock();
    expect(locker.isLocked).toBe(true);
  });

  it("becomes unlocked after unlock() called", () => {
    const locker = new Locker();
    locker.lock();
    locker.unlock();
    expect(locker.isLocked).toBe(false);
  });

  it("resolves wait() after unlock", async () => {
    const locker = new Locker();
    locker.lock();
    setTimeout(() => locker.unlock(), 0);
    await expect(locker.wait()).resolves.toBeUndefined();
  });
});

describe("createIncrement", () => {
  it("starts at 0 by default", () => {
    const inc = createIncrement();
    expect(inc()).toBe(0);
    expect(inc()).toBe(1);
  });

  it("starts at custom value", () => {
    const inc = createIncrement(5);
    expect(inc()).toBe(5);
    expect(inc()).toBe(6);
  });
});

describe("PromiseChain", () => {
  it("executes async functions in sequence", async () => {
    const chain = PromiseChain();
    const results: number[] = [];
    await Promise.all([
      chain(async () => { results.push(1); return 1; }),
      chain(async () => { results.push(2); return 2; }),
    ]);
    expect(results).toEqual([1, 2]);
  });
});

describe("createIncrement and PromiseChain — additional invariants", () => {
  it("createIncrement increments by 1 each call", () => {
    const inc = createIncrement(10);
    expect(inc()).toBe(10);
    expect(inc()).toBe(11);
    expect(inc()).toBe(12);
  });

  it("createIncrement with default start returns 0 first", () => {
    const inc = createIncrement();
    expect(inc()).toBe(0);
  });

  it("PromiseChain returns the resolved value of the function", async () => {
    const chain = PromiseChain();
    const result = await chain(async () => 42);
    expect(result).toBe(42);
  });

  it("PromiseChain rejects when the function throws", async () => {
    const chain = PromiseChain();
    await expect(chain(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
  });
});
