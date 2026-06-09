import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the app store before importing the function
vi.mock("@/app/store", () => ({
  appStore: {
    getState: vi.fn(() => ({
      chatModel: { provider: "openrouter", model: "anthropic/claude-3-5-sonnet" },
    })),
  },
}));

import { createAppendNode } from "./create-append-node";
import { NodeKind } from "lib/ai/workflow/workflow.interface";
import type { UINode } from "lib/ai/workflow/workflow.interface";
import type { Edge } from "@xyflow/react";

function makeUINode(id: string, kind: NodeKind, x = 0, y = 0): UINode {
  return {
    id,
    position: { x, y },
    type: "default",
    data: {
      id,
      kind,
      name: id.toUpperCase(),
      outputSchema: { type: "object", properties: {} },
    },
  } as any;
}

describe("createAppendNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new node with the given kind", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const { node } = createAppendNode({
      sourceNode: source,
      kind: NodeKind.LLM,
      allNodes: [source],
      allEdges: [],
    });
    expect(node.data.kind).toBe(NodeKind.LLM);
  });

  it("generates a unique id for the new node", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const { node } = createAppendNode({
      sourceNode: source,
      kind: NodeKind.LLM,
      allNodes: [source],
      allEdges: [],
    });
    expect(node.id).not.toBe(source.id);
    expect(typeof node.id).toBe("string");
  });

  it("positions new node to the right of source", () => {
    const source = makeUINode("input", NodeKind.Input, 100, 50);
    const { node } = createAppendNode({
      sourceNode: source,
      kind: NodeKind.LLM,
      allNodes: [source],
      allEdges: [],
    });
    expect(node.position.x).toBeGreaterThan(source.position.x);
  });

  it("creates an edge connecting source to new node", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const result = createAppendNode({
      sourceNode: source,
      kind: NodeKind.LLM,
      allNodes: [source],
      allEdges: [],
    });
    expect(result.edge).toBeDefined();
    expect(result.edge?.source).toBe(source.id);
    expect(result.edge?.target).toBe(result.node.id);
  });

  it("Note node returns no edge", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const result = createAppendNode({
      sourceNode: source,
      kind: NodeKind.Note,
      allNodes: [source],
      allEdges: [],
    });
    expect(result.edge).toBeUndefined();
  });

  it("generates unique name when same kind exists", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const existing = makeUINode("llm", NodeKind.LLM, 300, 0);
    existing.data.name = "LLM";
    const result = createAppendNode({
      sourceNode: source,
      kind: NodeKind.LLM,
      allNodes: [source, existing],
      allEdges: [],
    });
    expect(result.node.data.name).not.toBe("LLM");
  });

  it("merges provided edge properties", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const customEdge: Partial<Edge> = { sourceHandle: "right" };
    const result = createAppendNode({
      sourceNode: source,
      kind: NodeKind.Output,
      allNodes: [source],
      allEdges: [],
      edge: customEdge,
    });
    expect(result.edge?.sourceHandle).toBe("right");
  });

  it("sets model on LLM node from appStore", () => {
    const source = makeUINode("input", NodeKind.Input, 0, 0);
    const result = createAppendNode({
      sourceNode: source,
      kind: NodeKind.LLM,
      allNodes: [source],
      allEdges: [],
    });
    const nodeData = result.node.data as any;
    expect(nodeData.model).toBeDefined();
    expect(nodeData.model.provider).toBe("openrouter");
  });
});
