import { describe, expect, it, vi } from "vitest";
import type {
  OutputNodeData,
  LLMNodeData,
  ConditionNodeData,
  HttpNodeData,
  TemplateNodeData,
  NodeRuntimeField,
} from "./workflow.interface";
import {
  createUINode,
  defaultLLMNodeOutputSchema,
  defaultTemplateNodeOutputSchema,
} from "./create-ui-node";
import { NodeKind } from "./workflow.interface";

vi.mock("server-only", () => ({}));

describe("createUINode — basic shape", () => {
  it("returns an object with id, position, data, type", () => {
    const node = createUINode(NodeKind.Input);
    expect(node).toHaveProperty("id");
    expect(node).toHaveProperty("position");
    expect(node).toHaveProperty("data");
    expect(node).toHaveProperty("type");
  });

  it("type is always 'default'", () => {
    for (const kind of Object.values(NodeKind)) {
      expect(createUINode(kind as NodeKind).type).toBe("default");
    }
  });

  it("default position is {x:0, y:0}", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.position).toEqual({ x: 0, y: 0 });
  });

  it("custom position is applied", () => {
    const node = createUINode(NodeKind.LLM, { position: { x: 100, y: 200 } });
    expect(node.position).toEqual({ x: 100, y: 200 });
  });

  it("custom id is used when provided", () => {
    const node = createUINode(NodeKind.Input, { id: "custom-id" });
    expect(node.id).toBe("custom-id");
    expect(node.data.id).toBe("custom-id");
  });

  it("generates unique ids when none provided", () => {
    const a = createUINode(NodeKind.Input);
    const b = createUINode(NodeKind.Input);
    expect(a.id).not.toBe(b.id);
  });

  it("node id equals data.id", () => {
    const node = createUINode(NodeKind.LLM);
    expect(node.id).toBe(node.data.id);
  });

  it("custom name is applied", () => {
    const node = createUINode(NodeKind.Input, { name: "MyNode" });
    expect(node.data.name).toBe("MyNode");
  });

  it("default name is uppercased kind", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.data.name).toBe("INPUT");
  });
});

describe("createUINode — kind-specific data", () => {
  it("Input node has output schema", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.data.outputSchema).toBeDefined();
    expect(node.data.outputSchema.type).toBe("object");
  });

  it("Output node has outputData array", () => {
    const node = createUINode(NodeKind.Output);
    const data = node.data as OutputNodeData;
    expect(Array.isArray(data.outputData)).toBe(true);
  });

  it("LLM node has messages array with one user message", () => {
    const node = createUINode(NodeKind.LLM);
    const data = node.data as LLMNodeData;
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBe(1);
    expect(data.messages[0].role).toBe("user");
  });

  it("LLM node uses defaultLLMNodeOutputSchema", () => {
    const node = createUINode(NodeKind.LLM);
    expect(node.data.outputSchema.properties).toHaveProperty("answer");
    expect(node.data.outputSchema.properties).toHaveProperty("totalTokens");
  });

  it("Condition node has branches.if and branches.else", () => {
    const node = createUINode(NodeKind.Condition);
    const data = node.data as ConditionNodeData;
    expect(data.branches).toHaveProperty("if");
    expect(data.branches).toHaveProperty("else");
  });

  it("Condition.if branch has type 'if'", () => {
    const node = createUINode(NodeKind.Condition);
    const data = node.data as ConditionNodeData;
    expect(data.branches.if.type).toBe("if");
  });

  it("Tool node has tool_result in output schema", () => {
    const node = createUINode(NodeKind.Tool);
    expect(node.data.outputSchema.properties).toHaveProperty("tool_result");
  });

  it("Http node sets method to GET", () => {
    const node = createUINode(NodeKind.Http);
    const data = node.data as HttpNodeData;
    expect(data.method).toBe("GET");
  });

  it("Http node has response in output schema", () => {
    const node = createUINode(NodeKind.Http);
    expect(node.data.outputSchema.properties).toHaveProperty("response");
  });

  it("Http node default timeout is 30000", () => {
    const node = createUINode(NodeKind.Http);
    const data = node.data as HttpNodeData;
    expect(data.timeout).toBe(30000);
  });

  it("Template node uses defaultTemplateNodeOutputSchema", () => {
    const node = createUINode(NodeKind.Template);
    expect(node.data.outputSchema.properties).toHaveProperty("template");
  });

  it("Template node has template.type 'tiptap'", () => {
    const node = createUINode(NodeKind.Template);
    const data = node.data as TemplateNodeData;
    expect(data.template.type).toBe("tiptap");
  });
});

describe("createUINode — return type invariants", () => {
  it("all NodeKind values produce a valid node", () => {
    for (const kind of Object.values(NodeKind)) {
      const node = createUINode(kind as NodeKind);
      expect(typeof node.id).toBe("string");
      expect(node.id.length).toBeGreaterThan(0);
    }
  });

  it("data.runtime.isNew is true", () => {
    const node = createUINode(NodeKind.Input);
    const runtime = node.data.runtime as NodeRuntimeField;
    expect(runtime.isNew).toBe(true);
  });

  it("outputSchema is a fresh copy each call (not shared reference)", () => {
    const a = createUINode(NodeKind.Input);
    const b = createUINode(NodeKind.Input);
    expect(a.data.outputSchema).not.toBe(b.data.outputSchema);
  });
});

describe("defaultLLMNodeOutputSchema", () => {
  it("is type object", () => {
    expect(defaultLLMNodeOutputSchema.type).toBe("object");
  });

  it("has answer property of type string", () => {
    expect(defaultLLMNodeOutputSchema.properties.answer).toEqual({ type: "string" });
  });

  it("has totalTokens property of type number", () => {
    expect(defaultLLMNodeOutputSchema.properties.totalTokens).toEqual({ type: "number" });
  });
});

describe("defaultTemplateNodeOutputSchema", () => {
  it("is type object", () => {
    expect(defaultTemplateNodeOutputSchema.type).toBe("object");
  });

  it("has template property of type string", () => {
    expect(defaultTemplateNodeOutputSchema.properties.template).toEqual({ type: "string" });
  });
});
