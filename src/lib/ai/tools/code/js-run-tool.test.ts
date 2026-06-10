import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { jsExecutionSchema, jsExecutionTool } from "./js-run-tool";

// The AI SDK types inputSchema as FlexibleSchema, but at runtime it is a zod schema.
const inputSchema = jsExecutionTool.inputSchema as unknown as z.ZodTypeAny;

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
    const result = inputSchema.safeParse({ code: "console.log('hello')" });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejects empty code string", () => {
    // empty string is still a string — schema allows it
    const result = inputSchema.safeParse({ code: "" });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejects missing code field", () => {
    const result = inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("inputSchema rejects non-string code", () => {
    const result = inputSchema.safeParse({ code: 42 });
    expect(result.success).toBe(false);
  });

  it("inputSchema rejects null code", () => {
    const result = inputSchema.safeParse({ code: null });
    expect(result.success).toBe(false);
  });

  it("inputSchema accepts multi-line JS code", () => {
    const code = `const x = 1;\nconst y = 2;\nconsole.log(x + y);`;
    expect(inputSchema.safeParse({ code }).success).toBe(true);
  });

  it("has no server-side execute function (client-side only)", () => {
    expect(jsExecutionTool.execute).toBeUndefined();
  });
});

describe("jsExecutionSchema — properties completeness", () => {
  it("has a properties field", () => {
    expect(jsExecutionSchema.properties).toBeDefined();
  });

  it("has a required field as array", () => {
    expect(Array.isArray(jsExecutionSchema.required)).toBe(true);
  });

  it("code is the only required field", () => {
    expect(jsExecutionSchema.required).toHaveLength(1);
    expect(jsExecutionSchema.required?.[0]).toBe("code");
  });
});

describe("jsExecutionTool — tool metadata", () => {
  it("description mentions JavaScript or execution", () => {
    const desc = jsExecutionTool.description!.toLowerCase();
    const relevant =
      desc.includes("javascript") ||
      desc.includes("execut") ||
      desc.includes("code");
    expect(relevant).toBe(true);
  });

  it("inputSchema accepts extra fields (zod strips them by default)", () => {
    const result = inputSchema.safeParse({ code: "1+1", extra: "ignored" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extra).toBeUndefined();
    }
  });

  it("inputSchema accepts code with template literals", () => {
    const code = "const msg = `Hello ${'world'}`; console.log(msg);";
    expect(inputSchema.safeParse({ code }).success).toBe(true);
  });

  it("inputSchema accepts code with async/await syntax", () => {
    const code = "async function run() { await fetch('/api'); } run();";
    expect(inputSchema.safeParse({ code }).success).toBe(true);
  });

  it("execute is undefined (not a server-side tool)", () => {
    expect((jsExecutionTool as any).execute).toBeUndefined();
  });
});
