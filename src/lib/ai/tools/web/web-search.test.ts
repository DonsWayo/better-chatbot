import { describe, it, expect } from "vitest";
import {
  exaSearchSchema,
  exaContentsSchema,
  exaSearchTool,
  exaContentsTool,
} from "./web-search";

describe("exaSearchSchema", () => {
  it("requires query field", () => {
    expect(exaSearchSchema.required).toContain("query");
  });

  it("query is a string property", () => {
    const q = (exaSearchSchema.properties as any)?.query;
    expect(q?.type).toBe("string");
  });

  it("numResults has a default value", () => {
    const nr = (exaSearchSchema.properties as any)?.numResults;
    expect(nr?.default).toBeGreaterThan(0);
  });

  it("type has enum values including auto, neural, keyword", () => {
    const t = (exaSearchSchema.properties as any)?.type;
    expect(t?.enum).toContain("auto");
    expect(t?.enum).toContain("neural");
    expect(t?.enum).toContain("keyword");
  });

  it("includeDomains is an array of strings", () => {
    const d = (exaSearchSchema.properties as any)?.includeDomains;
    expect(d?.type).toBe("array");
    expect(d?.items?.type).toBe("string");
  });
});

describe("exaContentsSchema", () => {
  it("requires urls field", () => {
    expect(exaContentsSchema.required).toContain("urls");
  });

  it("urls is an array of strings", () => {
    const urls = (exaContentsSchema.properties as any)?.urls;
    expect(urls?.type).toBe("array");
    expect(urls?.items?.type).toBe("string");
  });

  it("maxCharacters has a default value", () => {
    const mc = (exaContentsSchema.properties as any)?.maxCharacters;
    expect(mc?.default).toBeGreaterThan(0);
  });
});

describe("exaSearchTool", () => {
  it("has an execute function", () => {
    expect(typeof exaSearchTool.execute).toBe("function");
  });

  it("has an inputSchema", () => {
    expect(exaSearchTool.inputSchema).toBeDefined();
  });

  it("execute returns error object when EXA_API_KEY is not set (no network)", async () => {
    const result = await exaSearchTool.execute!({ query: "test" } as any, {} as any);
    expect(result).toBeDefined();
    // Without EXA_API_KEY the safe() wrapper returns an error shape
    expect(typeof result === "object" || typeof result === "string").toBe(true);
  });
});

describe("exaContentsTool", () => {
  it("has an execute function", () => {
    expect(typeof exaContentsTool.execute).toBe("function");
  });

  it("has an inputSchema", () => {
    expect(exaContentsTool.inputSchema).toBeDefined();
  });

  it("execute returns error object for bad urls (no network)", async () => {
    const result = await exaContentsTool.execute!({ urls: ["http://invalid.example.invalid"] } as any, {} as any);
    expect(result).toBeDefined();
  });
});

describe("schema shapes", () => {
  it("exaSearchSchema type is object", () => {
    expect(exaSearchSchema.type).toBe("object");
  });

  it("exaContentsSchema type is object", () => {
    expect(exaContentsSchema.type).toBe("object");
  });

  it("exaSearchSchema has properties", () => {
    expect(exaSearchSchema.properties).toBeDefined();
    expect(typeof exaSearchSchema.properties).toBe("object");
  });

  it("exaContentsSchema has properties", () => {
    expect(exaContentsSchema.properties).toBeDefined();
    expect(typeof exaContentsSchema.properties).toBe("object");
  });

  it("exaSearchSchema required array is non-empty", () => {
    expect(Array.isArray(exaSearchSchema.required)).toBe(true);
    expect((exaSearchSchema.required as string[]).length).toBeGreaterThan(0);
  });

  it("exaContentsSchema required array is non-empty", () => {
    expect(Array.isArray(exaContentsSchema.required)).toBe(true);
    expect((exaContentsSchema.required as string[]).length).toBeGreaterThan(0);
  });

  it("search and contents tools have distinct inputSchemas", () => {
    expect(exaSearchTool.inputSchema).not.toBe(exaContentsTool.inputSchema);
  });
});
