import { describe, it, expect } from "vitest";
import {
  exaSearchSchema,
  exaContentsSchema,
  exaSearchTool,
  exaContentsTool,
  exaSearchToolForWorkflow,
  exaContentsToolForWorkflow,
} from "./web-search";
import type { JSONSchema7 } from "json-schema";

describe("exaSearchSchema", () => {
  it("is a valid JSONSchema7 object schema", () => {
    expect(exaSearchSchema.type).toBe("object");
    expect(typeof exaSearchSchema.properties).toBe("object");
  });

  it("requires 'query' field", () => {
    expect((exaSearchSchema.required as string[])?.includes("query")).toBe(true);
  });

  it("query property is of type string", () => {
    const queryProp = exaSearchSchema.properties?.query as JSONSchema7;
    expect(queryProp.type).toBe("string");
  });

  it("numResults has minimum 1 and maximum 20", () => {
    const numProp = exaSearchSchema.properties?.numResults as JSONSchema7;
    expect(numProp.minimum).toBe(1);
    expect(numProp.maximum).toBe(20);
  });

  it("type enum includes expected search modes", () => {
    const typeProp = exaSearchSchema.properties?.type as JSONSchema7;
    expect(typeProp.enum).toContain("auto");
    expect(typeProp.enum).toContain("keyword");
    expect(typeProp.enum).toContain("neural");
  });

  it("includeDomains is an array property", () => {
    const inclProp = exaSearchSchema.properties?.includeDomains as JSONSchema7;
    expect(inclProp.type).toBe("array");
  });

  it("excludeDomains is an array property", () => {
    const exclProp = exaSearchSchema.properties?.excludeDomains as JSONSchema7;
    expect(exclProp.type).toBe("array");
  });

  it("category enum contains expected categories", () => {
    const catProp = exaSearchSchema.properties?.category as JSONSchema7;
    expect(catProp.enum).toContain("news");
    expect(catProp.enum).toContain("github");
    expect(catProp.enum).toContain("pdf");
  });

  it("maxCharacters has minimum 100 and maximum 10000", () => {
    const maxCharProp = exaSearchSchema.properties?.maxCharacters as JSONSchema7;
    expect(maxCharProp.minimum).toBe(100);
    expect(maxCharProp.maximum).toBe(10000);
  });
});

describe("exaContentsSchema", () => {
  it("is a valid JSONSchema7 object schema", () => {
    expect(exaContentsSchema.type).toBe("object");
    expect(typeof exaContentsSchema.properties).toBe("object");
  });

  it("requires 'urls' field", () => {
    expect((exaContentsSchema.required as string[])?.includes("urls")).toBe(true);
  });

  it("urls is an array of strings", () => {
    const urlsProp = exaContentsSchema.properties?.urls as JSONSchema7;
    expect(urlsProp.type).toBe("array");
    const items = urlsProp.items as JSONSchema7;
    expect(items.type).toBe("string");
  });

  it("livecrawl enum contains expected values", () => {
    const liveProp = exaContentsSchema.properties?.livecrawl as JSONSchema7;
    expect(liveProp.enum).toContain("always");
    expect(liveProp.enum).toContain("fallback");
    expect(liveProp.enum).toContain("preferred");
  });

  it("maxCharacters has minimum and maximum constraints", () => {
    const maxProp = exaContentsSchema.properties?.maxCharacters as JSONSchema7;
    expect(maxProp.minimum).toBe(100);
    expect(maxProp.maximum).toBe(10000);
  });
});

describe("exaSearchTool", () => {
  it("is defined", () => {
    expect(exaSearchTool).toBeDefined();
  });

  it("has a description", () => {
    expect(typeof exaSearchTool.description).toBe("string");
    expect(exaSearchTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(exaSearchTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof exaSearchTool.execute).toBe("function");
  });
});

describe("exaContentsTool", () => {
  it("is defined", () => {
    expect(exaContentsTool).toBeDefined();
  });

  it("has a description", () => {
    expect(typeof exaContentsTool.description).toBe("string");
    expect(exaContentsTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(exaContentsTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof exaContentsTool.execute).toBe("function");
  });
});

describe("workflow tools", () => {
  it("exaSearchToolForWorkflow is defined", () => {
    expect(exaSearchToolForWorkflow).toBeDefined();
  });

  it("exaContentsToolForWorkflow is defined", () => {
    expect(exaContentsToolForWorkflow).toBeDefined();
  });

  it("workflow versions have execute functions", () => {
    expect(typeof exaSearchToolForWorkflow.execute).toBe("function");
    expect(typeof exaContentsToolForWorkflow.execute).toBe("function");
  });

  it("workflow search tool has a description", () => {
    expect(typeof exaSearchToolForWorkflow.description).toBe("string");
    expect(exaSearchToolForWorkflow.description!.length).toBeGreaterThan(0);
  });

  it("workflow contents tool has a description", () => {
    expect(typeof exaContentsToolForWorkflow.description).toBe("string");
    expect(exaContentsToolForWorkflow.description!.length).toBeGreaterThan(0);
  });
});
