import { describe, it, expect } from "vitest";
import {
  createUINode,
  defaultLLMNodeOutputSchema,
  defaultTemplateNodeOutputSchema,
} from "./create-ui-node";
import { NodeKind } from "./workflow.interface";

describe("createUINode", () => {
  it("creates an Input node with expected kind", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.data.kind).toBe(NodeKind.Input);
  });

  it("generates a UUID id by default", () => {
    const node = createUINode(NodeKind.Input);
    expect(typeof node.id).toBe("string");
    expect(node.id.length).toBeGreaterThan(0);
  });

  it("uses provided id option", () => {
    const node = createUINode(NodeKind.Input, { id: "fixed-id" });
    expect(node.id).toBe("fixed-id");
    expect(node.data.id).toBe("fixed-id");
  });

  it("uses provided position", () => {
    const node = createUINode(NodeKind.Input, { position: { x: 100, y: 200 } });
    expect(node.position).toEqual({ x: 100, y: 200 });
  });

  it("defaults position to origin when not provided", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.position).toEqual({ x: 0, y: 0 });
  });

  it("defaults name to uppercase kind", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.data.name).toBe("INPUT");
  });

  it("uses provided name option", () => {
    const node = createUINode(NodeKind.Input, { name: "My Input" });
    expect(node.data.name).toBe("My Input");
  });

  it("marks node as new via runtime flag", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.data.runtime?.isNew).toBe(true);
  });

  it("sets type to 'default'", () => {
    const node = createUINode(NodeKind.LLM);
    expect(node.type).toBe("default");
  });
});

describe("createUINode — Output node", () => {
  it("initializes outputData as empty array", () => {
    const node = createUINode(NodeKind.Output);
    expect((node.data as any).outputData).toEqual([]);
  });
});

describe("createUINode — LLM node", () => {
  it("has the default LLM output schema", () => {
    const node = createUINode(NodeKind.LLM);
    expect(node.data.outputSchema).toEqual(defaultLLMNodeOutputSchema);
  });

  it("initializes with one empty user message", () => {
    const node = createUINode(NodeKind.LLM);
    const data = node.data as any;
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].role).toBe("user");
  });
});

describe("createUINode — Condition node", () => {
  it("initializes branches with if and else", () => {
    const node = createUINode(NodeKind.Condition);
    const data = node.data as any;
    expect(data.branches.if).toBeDefined();
    expect(data.branches.else).toBeDefined();
    expect(data.branches.if.type).toBe("if");
    expect(data.branches.else.type).toBe("else");
  });

  it("if branch has empty conditions", () => {
    const node = createUINode(NodeKind.Condition);
    const data = node.data as any;
    expect(data.branches.if.conditions).toEqual([]);
    expect(data.branches.if.logicalOperator).toBe("AND");
  });
});

describe("createUINode — Tool node", () => {
  it("sets tool_result in output schema properties", () => {
    const node = createUINode(NodeKind.Tool);
    expect(node.data.outputSchema.properties?.tool_result).toBeDefined();
    expect(node.data.outputSchema.properties?.tool_result).toMatchObject({ type: "object" });
  });
});

describe("createUINode — HTTP node", () => {
  it("sets default method to GET", () => {
    const node = createUINode(NodeKind.Http);
    expect((node.data as any).method).toBe("GET");
  });

  it("initializes headers and query as empty arrays", () => {
    const node = createUINode(NodeKind.Http);
    const data = node.data as any;
    expect(data.headers).toEqual([]);
    expect(data.query).toEqual([]);
  });

  it("sets default timeout to 30000ms", () => {
    const node = createUINode(NodeKind.Http);
    expect((node.data as any).timeout).toBe(30000);
  });

  it("has response object in output schema", () => {
    const node = createUINode(NodeKind.Http);
    expect(node.data.outputSchema.properties?.response).toBeDefined();
    const responseSchema = node.data.outputSchema.properties?.response as any;
    expect(responseSchema.properties?.status).toMatchObject({ type: "number" });
    expect(responseSchema.properties?.ok).toMatchObject({ type: "boolean" });
  });
});

describe("createUINode — Template node", () => {
  it("has the default template output schema", () => {
    const node = createUINode(NodeKind.Template);
    expect(node.data.outputSchema).toEqual(defaultTemplateNodeOutputSchema);
  });

  it("initializes template with tiptap type and empty content", () => {
    const node = createUINode(NodeKind.Template);
    const data = node.data as any;
    expect(data.template.type).toBe("tiptap");
    expect(data.template.tiptap.type).toBe("doc");
    expect(data.template.tiptap.content).toEqual([]);
  });
});

describe("defaultLLMNodeOutputSchema", () => {
  it("has answer as string type", () => {
    expect(defaultLLMNodeOutputSchema.properties?.answer).toMatchObject({ type: "string" });
  });

  it("has totalTokens as number type", () => {
    expect(defaultLLMNodeOutputSchema.properties?.totalTokens).toMatchObject({ type: "number" });
  });
});

describe("defaultTemplateNodeOutputSchema", () => {
  it("has template as string type", () => {
    expect(defaultTemplateNodeOutputSchema.properties?.template).toMatchObject({ type: "string" });
  });
});

describe("createUINode — invariants", () => {
  it("node.data.id always matches node.id", () => {
    for (const kind of [NodeKind.Input, NodeKind.LLM, NodeKind.Output]) {
      const node = createUINode(kind);
      expect(node.data.id).toBe(node.id);
    }
  });

  it("outputSchema type is always 'object'", () => {
    for (const kind of [NodeKind.Input, NodeKind.LLM, NodeKind.Output, NodeKind.Tool]) {
      const node = createUINode(kind);
      expect(node.data.outputSchema.type).toBe("object");
    }
  });

  it("generated ids are unique across independent calls", () => {
    const ids = Array.from({ length: 5 }, () => createUINode(NodeKind.Input).id);
    expect(new Set(ids).size).toBe(5);
  });

  it("all node types have type property equal to 'default'", () => {
    for (const kind of [NodeKind.Input, NodeKind.LLM, NodeKind.Condition]) {
      expect(createUINode(kind).type).toBe("default");
    }
  });
});

describe("createUINode — output schema invariants", () => {
  it("defaultLLMNodeOutputSchema is a non-null object", () => {
    expect(defaultLLMNodeOutputSchema).not.toBeNull();
    expect(typeof defaultLLMNodeOutputSchema).toBe("object");
  });

  it("defaultTemplateNodeOutputSchema is a non-null object", () => {
    expect(defaultTemplateNodeOutputSchema).not.toBeNull();
    expect(typeof defaultTemplateNodeOutputSchema).toBe("object");
  });

  it("LLM node has a data property", () => {
    const node = createUINode(NodeKind.LLM);
    expect(node).toHaveProperty("data");
  });

  it("Input node has a data property", () => {
    const node = createUINode(NodeKind.Input);
    expect(node).toHaveProperty("data");
  });
});
