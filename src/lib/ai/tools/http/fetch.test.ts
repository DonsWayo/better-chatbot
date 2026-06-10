import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { httpFetchSchema, httpFetchTool } from "./fetch";

// The AI SDK types inputSchema as FlexibleSchema, but at runtime it is a zod schema.
const fetchInputSchema = httpFetchTool.inputSchema as unknown as z.ZodTypeAny;

describe("httpFetchSchema", () => {
  it("requires url field", () => {
    expect(httpFetchSchema.required).toContain("url");
  });

  it("url property is of type string", () => {
    const urlProp = (httpFetchSchema.properties as any)?.url;
    expect(urlProp?.type).toBe("string");
  });

  it("method is an enum with all expected HTTP methods", () => {
    const methodProp = (httpFetchSchema.properties as any)?.method;
    const methods = methodProp?.enum;
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toContain("PUT");
    expect(methods).toContain("DELETE");
    expect(methods).toContain("PATCH");
    expect(methods).toContain("HEAD");
    expect(methods).toContain("OPTIONS");
  });

  it("method has a default value of GET", () => {
    const methodProp = (httpFetchSchema.properties as any)?.method;
    expect(methodProp?.default).toBe("GET");
  });

  it("timeout has a positive default value", () => {
    const timeoutProp = (httpFetchSchema.properties as any)?.timeout;
    expect(timeoutProp?.default).toBeGreaterThan(0);
  });

  it("headers property allows additional properties (arbitrary headers)", () => {
    const headersProp = (httpFetchSchema.properties as any)?.headers;
    expect(headersProp?.additionalProperties).toBe(true);
  });

  it("body is a string property", () => {
    const bodyProp = (httpFetchSchema.properties as any)?.body;
    expect(bodyProp?.type).toBe("string");
  });

  it("schema type is object", () => {
    expect(httpFetchSchema.type).toBe("object");
  });
});

describe("httpFetchTool", () => {
  it("has an execute function", () => {
    expect(typeof httpFetchTool.execute).toBe("function");
  });

  it("has an inputSchema derived from httpFetchSchema", () => {
    expect(httpFetchTool.inputSchema).toBeDefined();
  });

  it("has a non-empty description", () => {
    expect(typeof httpFetchTool.description).toBe("string");
    expect(httpFetchTool.description!.length).toBeGreaterThan(0);
  });

  it("execute returns error for invalid URL", async () => {
    const result = await httpFetchTool.execute!(
      { url: "not-a-url" } as any,
      {} as any,
    );
    expect(result).toBeDefined();
    expect(typeof result === "object" || typeof result === "string").toBe(true);
  });

  it("execute returns error without throwing for unreachable host", async () => {
    const result = await httpFetchTool.execute!(
      { url: "http://localhost:99999/unreachable" } as any,
      {} as any,
    );
    expect(result).toBeDefined();
  });

  it("inputSchema rejects missing url field", () => {
    const result = fetchInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("inputSchema accepts url-only (all other fields optional)", () => {
    const result = fetchInputSchema.safeParse({ url: "http://example.com" });
    expect(result.success).toBe(true);
  });

  it("inputSchema accepts all optional fields alongside url", () => {
    const result = fetchInputSchema.safeParse({
      url: "http://example.com",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "val" }),
      timeout: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("error result has isError flag on failure", async () => {
    const result = await httpFetchTool.execute!(
      { url: "not-a-url" } as any,
      {} as any,
    );
    expect(result).toMatchObject({ isError: true });
  });
});

describe("httpFetchSchema — required and optional fields", () => {
  it("url is the only required field", () => {
    expect(httpFetchSchema.required).toHaveLength(1);
    expect(httpFetchSchema.required).toContain("url");
  });

  it("method, headers, body, timeout are all optional", () => {
    const optional = ["method", "headers", "body", "timeout"];
    for (const field of optional) {
      expect(httpFetchSchema.required).not.toContain(field);
    }
  });
});
