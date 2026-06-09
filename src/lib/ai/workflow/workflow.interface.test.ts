import { describe, expect, it } from "vitest";
import { NodeKind } from "./workflow.interface";

describe("NodeKind enum", () => {
  it("has Input value 'input'", () => {
    expect(NodeKind.Input).toBe("input");
  });

  it("has LLM value 'llm'", () => {
    expect(NodeKind.LLM).toBe("llm");
  });

  it("has Condition value 'condition'", () => {
    expect(NodeKind.Condition).toBe("condition");
  });

  it("has Note value 'note'", () => {
    expect(NodeKind.Note).toBe("note");
  });

  it("has Tool value 'tool'", () => {
    expect(NodeKind.Tool).toBe("tool");
  });

  it("has Http value 'http'", () => {
    expect(NodeKind.Http).toBe("http");
  });

  it("has Template value 'template'", () => {
    expect(NodeKind.Template).toBe("template");
  });

  it("has Output value 'output'", () => {
    expect(NodeKind.Output).toBe("output");
  });

  it("has at least 8 members", () => {
    expect(Object.keys(NodeKind).length).toBeGreaterThanOrEqual(8);
  });
});

describe("NodeKind — value invariants", () => {
  it("all values are non-empty strings", () => {
    for (const v of Object.values(NodeKind)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("all values are lowercase", () => {
    for (const v of Object.values(NodeKind)) {
      expect(v).toBe(v.toLowerCase());
    }
  });

  it("all values are unique", () => {
    const values = Object.values(NodeKind);
    expect(new Set(values).size).toBe(values.length);
  });

  it("Input and Output are distinct", () => {
    expect(NodeKind.Input).not.toBe(NodeKind.Output);
  });
});
