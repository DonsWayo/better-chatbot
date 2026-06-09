import { describe, expect, it } from "vitest";
import type { JSONSchema7 } from "json-schema";
import { jsExecutionSchema } from "./js-run-tool";

const codeProp = jsExecutionSchema.properties?.code as unknown as JSONSchema7;

describe("jsExecutionSchema", () => {
  it("is type object", () => {
    expect(jsExecutionSchema.type).toBe("object");
  });

  it("has code as required field", () => {
    expect(jsExecutionSchema.required).toContain("code");
  });

  it("code property is type string", () => {
    expect(codeProp?.type).toBe("string");
  });

  it("code property has a description", () => {
    expect(typeof codeProp?.description).toBe("string");
    expect((codeProp?.description ?? "").length).toBeGreaterThan(0);
  });

  it("required is an array", () => {
    expect(Array.isArray(jsExecutionSchema.required)).toBe(true);
  });
});

describe("jsExecutionSchema — shape invariants", () => {
  it("has properties object", () => {
    expect(typeof jsExecutionSchema.properties).toBe("object");
    expect(jsExecutionSchema.properties).not.toBeNull();
  });

  it("has at least one property", () => {
    expect(Object.keys(jsExecutionSchema.properties ?? {}).length).toBeGreaterThanOrEqual(1);
  });

  it("all required fields exist in properties", () => {
    for (const key of jsExecutionSchema.required ?? []) {
      expect(jsExecutionSchema.properties).toHaveProperty(key);
    }
  });

  it("required contains exactly 'code'", () => {
    expect(jsExecutionSchema.required).toHaveLength(1);
    expect(jsExecutionSchema.required).toContain("code");
  });

  it("properties contains only 'code'", () => {
    const keys = Object.keys(jsExecutionSchema.properties ?? {});
    expect(keys).toEqual(["code"]);
  });

  it("code description mentions console.log", () => {
    expect(codeProp?.description).toMatch(/console\.log/);
  });

  it("code description mentions async", () => {
    expect(codeProp?.description).toMatch(/async/);
  });

  it("code description mentions fetch", () => {
    expect(codeProp?.description).toMatch(/fetch/);
  });

  it("jsExecutionSchema has no additionalProperties restriction", () => {
    expect(jsExecutionSchema.additionalProperties).toBeUndefined();
  });

  it("code property has no enum restriction", () => {
    expect(codeProp?.enum).toBeUndefined();
  });

  it("code property has no minLength set", () => {
    expect(codeProp?.minLength).toBeUndefined();
  });
});
