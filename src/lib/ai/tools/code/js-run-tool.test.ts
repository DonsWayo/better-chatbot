import { describe, expect, it } from "vitest";
import { jsExecutionSchema } from "./js-run-tool";

describe("jsExecutionSchema", () => {
  it("is type object", () => {
    expect(jsExecutionSchema.type).toBe("object");
  });

  it("has code as required field", () => {
    expect(jsExecutionSchema.required).toContain("code");
  });

  it("code property is type string", () => {
    const code = jsExecutionSchema.properties?.code as any;
    expect(code?.type).toBe("string");
  });

  it("code property has a description", () => {
    const code = jsExecutionSchema.properties?.code as any;
    expect(typeof code?.description).toBe("string");
    expect(code?.description.length).toBeGreaterThan(0);
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
});
