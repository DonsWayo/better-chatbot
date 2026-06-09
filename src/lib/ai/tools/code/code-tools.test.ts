import { describe, it, expect } from "vitest";
import { jsExecutionSchema, jsExecutionTool } from "./js-run-tool";
import { pythonExecutionSchema, pythonExecutionTool } from "./python-run-tool";

describe("jsExecutionSchema", () => {
  it("is defined", () => {
    expect(jsExecutionSchema).toBeDefined();
  });

  it("is of type object", () => {
    expect(jsExecutionSchema.type).toBe("object");
  });

  it("requires 'code' property", () => {
    expect(jsExecutionSchema.required).toContain("code");
  });

  it("code property is of type string", () => {
    expect((jsExecutionSchema.properties?.code as any).type).toBe("string");
  });

  it("code property has a description", () => {
    const desc = (jsExecutionSchema.properties?.code as any).description;
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("jsExecutionTool", () => {
  it("has a description", () => {
    expect(typeof jsExecutionTool.description).toBe("string");
    expect(jsExecutionTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(jsExecutionTool.inputSchema).toBeDefined();
  });

  it("is client-side — no server execute function", () => {
    expect(jsExecutionTool.execute).toBeUndefined();
  });

  it("inputSchema validates code field", () => {
    const r = jsExecutionTool.inputSchema.safeParse({ code: "console.log('hello')" });
    expect(r.success).toBe(true);
  });

  it("inputSchema rejects missing code", () => {
    const r = jsExecutionTool.inputSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("pythonExecutionSchema", () => {
  it("is defined", () => {
    expect(pythonExecutionSchema).toBeDefined();
  });

  it("is of type object", () => {
    expect(pythonExecutionSchema.type).toBe("object");
  });

  it("requires 'code' property", () => {
    expect(pythonExecutionSchema.required).toContain("code");
  });

  it("code property is of type string", () => {
    expect((pythonExecutionSchema.properties?.code as any).type).toBe("string");
  });
});

describe("pythonExecutionTool", () => {
  it("has a description", () => {
    expect(typeof pythonExecutionTool.description).toBe("string");
    expect(pythonExecutionTool.description!.length).toBeGreaterThan(0);
  });

  it("is client-side — no server execute function", () => {
    expect(pythonExecutionTool.execute).toBeUndefined();
  });

  it("inputSchema validates code field", () => {
    const r = pythonExecutionTool.inputSchema.safeParse({ code: "print('hello')" });
    expect(r.success).toBe(true);
  });

  it("inputSchema rejects missing code", () => {
    const r = pythonExecutionTool.inputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("has a defined inputSchema", () => {
    expect(pythonExecutionTool.inputSchema).toBeDefined();
  });

  it("rejects non-string code value", () => {
    const r = pythonExecutionTool.inputSchema.safeParse({ code: 42 });
    expect(r.success).toBe(false);
  });
});

describe("js vs python schemas — distinction", () => {
  it("jsExecutionSchema and pythonExecutionSchema are different objects", () => {
    expect(jsExecutionSchema).not.toBe(pythonExecutionSchema);
  });

  it("both schemas require 'code'", () => {
    expect(jsExecutionSchema.required).toContain("code");
    expect(pythonExecutionSchema.required).toContain("code");
  });

  it("both tools are client-side with no execute", () => {
    expect(jsExecutionTool.execute).toBeUndefined();
    expect(pythonExecutionTool.execute).toBeUndefined();
  });

  it("both tools have descriptions mentioning their language", () => {
    const jsDesc = jsExecutionTool.description?.toLowerCase() ?? "";
    const pyDesc = pythonExecutionTool.description?.toLowerCase() ?? "";
    expect(jsDesc.includes("javascript") || jsDesc.includes("js")).toBe(true);
    expect(pyDesc.includes("python")).toBe(true);
  });
});
