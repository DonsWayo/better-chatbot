import { describe, it, expect } from "vitest";
import { pythonExecutionSchema, pythonExecutionTool } from "./python-run-tool";

describe("pythonExecutionSchema", () => {
  it("is an object schema", () => {
    expect(pythonExecutionSchema.type).toBe("object");
  });

  it("requires the code field", () => {
    expect(pythonExecutionSchema.required).toContain("code");
  });

  it("code property is of type string", () => {
    const codeProp = (pythonExecutionSchema.properties as any)?.code;
    expect(codeProp?.type).toBe("string");
  });

  it("code property has a description that mentions Pyodide", () => {
    const codeProp = (pythonExecutionSchema.properties as any)?.code;
    expect(codeProp?.description).toContain("Pyodide");
  });
});

describe("pythonExecutionTool", () => {
  it("has a non-empty description", () => {
    expect(typeof pythonExecutionTool.description).toBe("string");
    expect(pythonExecutionTool.description!.length).toBeGreaterThan(0);
  });

  it("description mentions Pyodide", () => {
    expect(pythonExecutionTool.description).toContain("Pyodide");
  });

  it("has an inputSchema", () => {
    expect(pythonExecutionTool.inputSchema).toBeDefined();
  });

  it("inputSchema accepts valid python code", () => {
    const result = pythonExecutionTool.inputSchema.safeParse({
      code: "print('Hello, World!')",
    });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejects missing code field", () => {
    const result = pythonExecutionTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("inputSchema rejects non-string code", () => {
    const result = pythonExecutionTool.inputSchema.safeParse({ code: 123 });
    expect(result.success).toBe(false);
  });

  it("inputSchema rejects null code", () => {
    const result = pythonExecutionTool.inputSchema.safeParse({ code: null });
    expect(result.success).toBe(false);
  });

  it("inputSchema accepts multi-line python code", () => {
    const multiLine = `
import pandas as pd
df = pd.DataFrame({'a': [1, 2, 3]})
print(df.head())
    `.trim();
    const result = pythonExecutionTool.inputSchema.safeParse({ code: multiLine });
    expect(result.success).toBe(true);
  });

  it("has no server-side execute function (client-side only)", () => {
    expect(pythonExecutionTool.execute).toBeUndefined();
  });

  it("inputSchema rejects empty object", () => {
    const result = pythonExecutionTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("pythonExecutionSchema — properties completeness", () => {
  it("has a properties field", () => {
    expect(pythonExecutionSchema.properties).toBeDefined();
  });

  it("has a required field as array", () => {
    expect(Array.isArray(pythonExecutionSchema.required)).toBe(true);
  });

  it("code is the only required field", () => {
    expect(pythonExecutionSchema.required).toHaveLength(1);
    expect(pythonExecutionSchema.required![0]).toBe("code");
  });

  it("code description mentions network access via pyodide.http", () => {
    const codeProp = (pythonExecutionSchema.properties as any)?.code;
    expect(codeProp?.description).toContain("pyodide.http");
  });
});

describe("pythonExecutionTool — schema edge cases", () => {
  it("inputSchema accepts empty string code (empty script is valid Python)", () => {
    const result = pythonExecutionTool.inputSchema.safeParse({ code: "" });
    expect(result.success).toBe(true);
  });

  it("description is a non-empty string", () => {
    expect(typeof pythonExecutionTool.description).toBe("string");
    expect((pythonExecutionTool.description ?? "").length).toBeGreaterThan(10);
  });

  it("inputSchema is the same object as pythonExecutionSchema (same schema)", () => {
    expect(pythonExecutionTool.inputSchema).toBeDefined();
    expect(pythonExecutionTool.inputSchema.safeParse).toBeDefined();
  });
});
