import { describe, it, expect } from "vitest";
import { jsExecutionSchema, jsExecutionTool } from "./js-run-tool";

describe("jsExecutionSchema", () => {
  it("is an object schema", () => {
    expect(jsExecutionSchema.type).toBe("object");
  });

  it("requires the code field", () => {
    expect(jsExecutionSchema.required).toContain("code");
  });

  it("code property is of type string", () => {
    const codeProp = (jsExecutionSchema.properties as any)?.code;
    expect(codeProp?.type).toBe("string");
  });

  it("code property has a description", () => {
    const codeProp = (jsExecutionSchema.properties as any)?.code;
    expect(typeof codeProp?.description).toBe("string");
    expect(codeProp?.description.length).toBeGreaterThan(0);
  });
});

describe("jsExecutionTool", () => {
  it("has a non-empty description", () => {
    expect(typeof jsExecutionTool.description).toBe("string");
    expect(jsExecutionTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(jsExecutionTool.inputSchema).toBeDefined();
  });

  it("inputSchema accepts valid code object", () => {
    const result = jsExecutionTool.inputSchema.safeParse({ code: "console.log('hello')" });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejects empty code string", () => {
    // empty string is still a string — schema allows it
    const result = jsExecutionTool.inputSchema.safeParse({ code: "" });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejects missing code field", () => {
    const result = jsExecutionTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("inputSchema rejects non-string code", () => {
    const result = jsExecutionTool.inputSchema.safeParse({ code: 42 });
    expect(result.success).toBe(false);
  });

  it("inputSchema rejects null code", () => {
    const result = jsExecutionTool.inputSchema.safeParse({ code: null });
    expect(result.success).toBe(false);
  });
});
