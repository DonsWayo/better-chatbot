import { describe, expect, it } from "vitest";
import { NodeKind } from "../workflow.interface";
import { extractNodeDependencySchema } from "./extract-node-dependency-schema";

const makeBase = (overrides: any = {}) => ({
  id: "n1",
  name: "TestNode",
  position: { x: 0, y: 0 },
  outputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  ...overrides,
});

describe("extractNodeDependencySchema", () => {
  it("returns empty schema when target node not found", () => {
    const result = extractNodeDependencySchema({
      targetId: "missing",
      nodes: [],
    });
    expect(result.type).toBe("object");
    expect(result.properties).toBeDefined();
  });

  it("returns outputSchema for Input node", () => {
    const inputSchema = {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
        age: { type: "number" as const },
      },
      required: ["name"],
    };
    const nodes = [
      makeBase({ id: "n1", kind: NodeKind.Input, outputSchema: inputSchema }),
    ];
    const result = extractNodeDependencySchema({ targetId: "n1", nodes });
    expect(result).toEqual(inputSchema);
  });

  it("returns schema with output data keys for Output node", () => {
    const sourceNode = makeBase({
      id: "src",
      kind: NodeKind.LLM,
      outputSchema: {
        type: "object" as const,
        properties: { response: { type: "string" as const } },
        required: [],
      },
    });
    const outputNode = makeBase({
      id: "out",
      kind: NodeKind.Output,
      outputData: [
        {
          key: "result",
          source: { nodeId: "src", path: ["response"] },
        },
      ],
    });
    const result = extractNodeDependencySchema({
      targetId: "out",
      nodes: [sourceNode, outputNode],
    });
    expect(result.type).toBe("object");
    expect(result.properties?.result).toBeDefined();
    expect((result.properties?.result as any).type).toBe("string");
  });

  it("skips output data entries without a key", () => {
    const outputNode = makeBase({
      id: "out",
      kind: NodeKind.Output,
      outputData: [{ key: "", source: null }],
    });
    const result = extractNodeDependencySchema({
      targetId: "out",
      nodes: [outputNode],
    });
    expect(Object.keys(result.properties ?? {})).toHaveLength(0);
  });

  it("returns empty schema for LLM node (no special handling)", () => {
    const nodes = [makeBase({ id: "n1", kind: NodeKind.LLM })];
    const result = extractNodeDependencySchema({ targetId: "n1", nodes });
    expect(result.type).toBe("object");
    expect(result.properties).toBeDefined();
  });

  it("defaults key schema to string when source node not found", () => {
    const outputNode = makeBase({
      id: "out",
      kind: NodeKind.Output,
      outputData: [
        { key: "myKey", source: { nodeId: "nonexistent", path: ["field"] } },
      ],
    });
    const result = extractNodeDependencySchema({
      targetId: "out",
      nodes: [outputNode],
    });
    expect((result.properties?.myKey as any).type).toBe("string");
  });

  it("multiple output data entries produce multiple properties", () => {
    const srcNode = makeBase({
      id: "src",
      kind: NodeKind.LLM,
      outputSchema: {
        type: "object" as const,
        properties: {
          text: { type: "string" as const },
          score: { type: "number" as const },
        },
        required: [],
      },
    });
    const outputNode = makeBase({
      id: "out",
      kind: NodeKind.Output,
      outputData: [
        { key: "result", source: { nodeId: "src", path: ["text"] } },
        { key: "rating", source: { nodeId: "src", path: ["score"] } },
      ],
    });
    const result = extractNodeDependencySchema({
      targetId: "out",
      nodes: [srcNode, outputNode],
    });
    expect(Object.keys(result.properties ?? {})).toHaveLength(2);
    expect(result.properties?.result).toBeDefined();
    expect(result.properties?.rating).toBeDefined();
  });

  it("result always has a properties object", () => {
    const result = extractNodeDependencySchema({
      targetId: "missing",
      nodes: [],
    });
    expect(result.properties).toBeDefined();
    expect(typeof result.properties).toBe("object");
  });

  it("result type is always 'object' for Input and LLM nodes", () => {
    for (const kind of [NodeKind.Input, NodeKind.LLM]) {
      const nodes = [makeBase({ id: "n1", kind })];
      const result = extractNodeDependencySchema({ targetId: "n1", nodes });
      expect(result.type).toBe("object");
    }
  });
});
