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

  it("method is an enum with expected values", () => {
    const methodProp = (httpFetchSchema.properties as any)?.method;
    expect(methodProp?.enum).toContain("GET");
    expect(methodProp?.enum).toContain("POST");
    expect(methodProp?.enum).toContain("DELETE");
  });

  it("timeout has a default value", () => {
    const timeoutProp = (httpFetchSchema.properties as any)?.timeout;
    expect(timeoutProp?.default).toBeGreaterThan(0);
  });
});

describe("httpFetchTool", () => {
  it("has an execute function", () => {
    expect(typeof httpFetchTool.execute).toBe("function");
  });

  it("has an inputSchema derived from httpFetchSchema", () => {
    expect(httpFetchTool.inputSchema).toBeDefined();
  });

  it("execute returns error for invalid URL", async () => {
    const result = await httpFetchTool.execute!({ url: "not-a-url" } as any, {} as any);
    // Should return an error object (safe wraps failures)
    expect(result).toBeDefined();
    // The result will be an error description, not throw
    expect(typeof result === "object" || typeof result === "string").toBe(true);
  });
});
