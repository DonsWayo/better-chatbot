import { describe, expect, it } from "vitest";
import type { JSONSchema7 } from "json-schema";
import { httpFetchSchema } from "./fetch";

const prop = (key: string) => httpFetchSchema.properties?.[key] as unknown as JSONSchema7;

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
    expect(Array.isArray(prop("method")?.enum)).toBe(true);
  });

  it("method enum includes GET and POST", () => {
    const methodEnum = prop("method")?.enum as string[] | undefined;
    expect(methodEnum).toContain("GET");
    expect(methodEnum).toContain("POST");
  });

  it("method enum includes all common HTTP methods", () => {
    const methodEnum = prop("method")?.enum as string[] | undefined;
    for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      expect(methodEnum).toContain(m);
    }
  });

  it("timeout property has a default value", () => {
    const timeout = prop("timeout");
    expect(timeout?.default).toBeDefined();
    expect(typeof timeout?.default).toBe("number");
  });

  it("headers property allows additionalProperties", () => {
    const headers = prop("headers");
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
    expect(prop("method")?.default).toBe("GET");
  });
});
