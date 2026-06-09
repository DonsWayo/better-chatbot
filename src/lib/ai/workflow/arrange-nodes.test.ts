import { describe, it, expect } from "vitest";
import { arrangeNodes } from "./arrange-nodes";
import { NodeKind } from "./workflow.interface";
import type { UINode } from "./workflow.interface";
import type { Edge } from "@xyflow/react";

function makeNode(id: string, kind: NodeKind, x = 0, y = 0): UINode {
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

function makeEdge(source: string, target: string, id?: string): Edge {
  return {
    id: id ?? `${source}->${target}`,
    source,
    target,
  } as Edge;
}

describe("arrangeNodes", () => {
  it("returns original nodes when no input node exists", () => {
    const nodes = [makeNode("a", NodeKind.LLM, 50, 50)];
    const { nodes: result } = arrangeNodes(nodes, []);
    expect(result[0].position).toEqual({ x: 50, y: 50 });
  });

  it("places input node at origin", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, 999, 999),
      makeNode("output", NodeKind.Output, 0, 0),
    ];
    const edges = [makeEdge("input", "output")];
    const { nodes: result } = arrangeNodes(nodes, edges);
    const input = result.find((n) => n.id === "input")!;
    expect(input.position).toEqual({ x: 0, y: 0 });
  });

  it("places child to the right of input (x > 0)", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, 0, 0),
      makeNode("llm", NodeKind.LLM, 0, 0),
    ];
    const edges = [makeEdge("input", "llm")];
    const { nodes: result } = arrangeNodes(nodes, edges);
    const llm = result.find((n) => n.id === "llm")!;
    expect(llm.position.x).toBeGreaterThan(0);
  });

  it("arranges linear chain in increasing x positions", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("mid", NodeKind.LLM),
      makeNode("output", NodeKind.Output),
    ];
    const edges = [
      makeEdge("input", "mid"),
      makeEdge("mid", "output"),
    ];
    const { nodes: result } = arrangeNodes(nodes, edges);
    const inputX = result.find((n) => n.id === "input")!.position.x;
    const midX = result.find((n) => n.id === "mid")!.position.x;
    const outputX = result.find((n) => n.id === "output")!.position.x;
    expect(midX).toBeGreaterThan(inputX);
    expect(outputX).toBeGreaterThan(midX);
  });

  it("preserves nodes not connected to any edge", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, 0, 0),
      makeNode("isolated", NodeKind.Note, 123, 456),
    ];
    const edges: Edge[] = [];
    const { nodes: result } = arrangeNodes(nodes, edges);
    const isolated = result.find((n) => n.id === "isolated")!;
    expect(isolated.position).toEqual({ x: 123, y: 456 });
  });

  it("returns all original nodes even when some have no edges", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, 0, 0),
      makeNode("connected", NodeKind.LLM, 0, 0),
      makeNode("floating", NodeKind.Note, 999, 999),
    ];
    const edges = [makeEdge("input", "connected")];
    const { nodes: result } = arrangeNodes(nodes, edges);
    expect(result).toHaveLength(3);
  });

  it("does not mutate original nodes array", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, 0, 0),
      makeNode("output", NodeKind.Output, 0, 0),
    ];
    const originalPositions = nodes.map((n) => ({ ...n.position }));
    arrangeNodes(nodes, [makeEdge("input", "output")]);
    // Original nodes should remain at their original positions
    nodes.forEach((n, i) => {
      expect(n.position).toEqual(originalPositions[i]);
    });
  });

  it("distributes parallel branches vertically", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, 0, 0),
      makeNode("branchA", NodeKind.LLM, 0, 0),
      makeNode("branchB", NodeKind.LLM, 0, 0),
    ];
    const edges = [
      makeEdge("input", "branchA"),
      makeEdge("input", "branchB"),
    ];
    const { nodes: result } = arrangeNodes(nodes, edges);
    const a = result.find((n) => n.id === "branchA")!;
    const b = result.find((n) => n.id === "branchB")!;
    // Both should be at the same x level
    expect(a.position.x).toBe(b.position.x);
    // They should have different y positions (not overlapping)
    expect(a.position.y).not.toBe(b.position.y);
  });
});
