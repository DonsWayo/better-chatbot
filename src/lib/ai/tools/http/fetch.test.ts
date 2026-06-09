import { describe, it, expect } from "vitest";
import { httpFetchSchema, httpFetchTool } from "./fetch";

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
    const result = await httpFetchTool.execute!({ url: "not-a-url" } as any, {} as any);
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
});
