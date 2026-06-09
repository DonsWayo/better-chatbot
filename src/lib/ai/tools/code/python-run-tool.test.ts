import { describe, expect, it } from "vitest";
import { pythonExecutionSchema } from "./python-run-tool";

describe("pythonExecutionSchema", () => {
  it("is type object", () => {
    expect(pythonExecutionSchema.type).toBe("object");
  });

  it("has code as required field", () => {
    expect(pythonExecutionSchema.required).toContain("code");
  });

  it("code property is type string", () => {
    const code = pythonExecutionSchema.properties?.code as any;
    expect(code?.type).toBe("string");
  });

  it("code property has a description mentioning Python", () => {
    const code = pythonExecutionSchema.properties?.code as any;
    expect(typeof code?.description).toBe("string");
    expect(code?.description.toLowerCase()).toContain("python");
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
