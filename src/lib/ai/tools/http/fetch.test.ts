import { describe, expect, it } from "vitest";
import { httpFetchSchema } from "./fetch";

describe("httpFetchSchema", () => {
  it("is an object schema", () => {
    expect(httpFetchSchema.type).toBe("object");
  });

  it("has url as a required property", () => {
    expect(httpFetchSchema.required).toContain("url");
  });

  it("url property is a string type", () => {
    expect(httpFetchSchema.properties?.url).toMatchObject({ type: "string" });
  });

  it("method property is an enum", () => {
    const method = httpFetchSchema.properties?.method as any;
    expect(Array.isArray(method?.enum)).toBe(true);
  });

  it("method enum includes GET and POST", () => {
    const method = httpFetchSchema.properties?.method as any;
    expect(method.enum).toContain("GET");
    expect(method.enum).toContain("POST");
  });

  it("method enum includes all common HTTP methods", () => {
    const method = httpFetchSchema.properties?.method as any;
    for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      expect(method.enum).toContain(m);
    }
  });

  it("timeout property has a default value", () => {
    const timeout = httpFetchSchema.properties?.timeout as any;
    expect(timeout?.default).toBeDefined();
    expect(typeof timeout?.default).toBe("number");
  });

  it("headers property allows additionalProperties", () => {
    const headers = httpFetchSchema.properties?.headers as any;
    expect(headers?.additionalProperties).toBe(true);
  });
});

describe("httpFetchSchema — shape invariants", () => {
  it("has properties object", () => {
    expect(typeof httpFetchSchema.properties).toBe("object");
    expect(httpFetchSchema.properties).not.toBeNull();
  });

  it("required is an array", () => {
    expect(Array.isArray(httpFetchSchema.required)).toBe(true);
  });

  it("has at least 2 properties defined", () => {
    expect(Object.keys(httpFetchSchema.properties ?? {}).length).toBeGreaterThanOrEqual(2);
  });

  it("method default is GET", () => {
    const method = httpFetchSchema.properties?.method as any;
    expect(method?.default).toBe("GET");
  });
});
