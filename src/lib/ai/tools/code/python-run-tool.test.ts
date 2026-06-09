import { describe, expect, it } from "vitest";
import type { JSONSchema7 } from "json-schema";
import { pythonExecutionSchema } from "./python-run-tool";

const codeProp = pythonExecutionSchema.properties?.code as unknown as JSONSchema7;

describe("pythonExecutionSchema", () => {
  it("is type object", () => {
    expect(pythonExecutionSchema.type).toBe("object");
  });

  it("has code as required field", () => {
    expect(pythonExecutionSchema.required).toContain("code");
  });

  it("code property is type string", () => {
    expect(codeProp?.type).toBe("string");
  });

  it("code property has a description mentioning Python", () => {
    expect(typeof codeProp?.description).toBe("string");
    expect((codeProp?.description ?? "").toLowerCase()).toContain("python");
  });

  it("required is an array", () => {
    expect(Array.isArray(pythonExecutionSchema.required)).toBe(true);
  });
});

describe("pythonExecutionSchema — shape invariants", () => {
  it("has properties object", () => {
    expect(typeof pythonExecutionSchema.properties).toBe("object");
    expect(pythonExecutionSchema.properties).not.toBeNull();
  });

  it("all required fields exist in properties", () => {
    for (const key of pythonExecutionSchema.required ?? []) {
      expect(pythonExecutionSchema.properties).toHaveProperty(key);
    }
  });
});
