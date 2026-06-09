import { describe, it, expect } from "vitest";
import { arrangeNodes } from "./arrange-nodes";
import { NodeKind } from "./workflow.interface";

function makeNode(id: string, kind: NodeKind, position = { x: 0, y: 0 }): any {
  return {
    id,
    position,
    data: { kind, id, name: id.toUpperCase(), outputSchema: { type: "object", properties: {} } },
    type: "default",
  };
}

function makeEdge(source: string, target: string): any {
  return { id: `${source}-${target}`, source, target };
}

describe("arrangeNodes", () => {
  it("returns nodes unchanged when no Input node exists", () => {
    const nodes = [makeNode("n1", NodeKind.LLM), makeNode("n2", NodeKind.Output)];
    const edges = [makeEdge("n1", "n2")];
    const { nodes: result } = arrangeNodes(nodes, edges);
    expect(result).toHaveLength(2);
    // No repositioning happened since there's no Input node
    expect(result[0].id).toBe("n1");
  });

  it("arranges a linear chain Input→LLM→Output", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("llm", NodeKind.LLM),
      makeNode("output", NodeKind.Output),
    ];
    const edges = [makeEdge("input", "llm"), makeEdge("llm", "output")];
    const { nodes: result } = arrangeNodes(nodes, edges);

    const inputNode = result.find((n) => n.id === "input")!;
    const llmNode = result.find((n) => n.id === "llm")!;
    const outputNode = result.find((n) => n.id === "output")!;

    // Each level should be further right than the previous
    expect(llmNode.position.x).toBeGreaterThan(inputNode.position.x);
    expect(outputNode.position.x).toBeGreaterThan(llmNode.position.x);
  });

  it("preserves total node count", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("llm1", NodeKind.LLM),
      makeNode("llm2", NodeKind.LLM),
      makeNode("output", NodeKind.Output),
    ];
    const edges = [
      makeEdge("input", "llm1"),
      makeEdge("input", "llm2"),
      makeEdge("llm1", "output"),
      makeEdge("llm2", "output"),
    ];
    const { nodes: result } = arrangeNodes(nodes, edges);
    expect(result).toHaveLength(4);
  });

  it("handles disconnected nodes (no edges)", () => {
    const nodes = [makeNode("n1", NodeKind.Input), makeNode("n2", NodeKind.LLM)];
    const { nodes: result } = arrangeNodes(nodes, []);
    // No edges means no repositioning — nodes stay at original positions
    expect(result).toHaveLength(2);
  });

  it("returns ArrangeNodesResult shape", () => {
    const nodes = [makeNode("input", NodeKind.Input), makeNode("output", NodeKind.Output)];
    const edges = [makeEdge("input", "output")];
    const result = arrangeNodes(nodes, edges);
    expect(result).toHaveProperty("nodes");
    expect(Array.isArray(result.nodes)).toBe(true);
  });

  it("parallel branches do not overlap (different y positions)", () => {
    const nodes = [
      makeNode("input", NodeKind.Input, { x: 0, y: 0 }),
      makeNode("branch1", NodeKind.LLM, { x: 0, y: 0 }),
      makeNode("branch2", NodeKind.LLM, { x: 0, y: 200 }),
      makeNode("output", NodeKind.Output, { x: 0, y: 100 }),
    ];
    const edges = [
      makeEdge("input", "branch1"),
      makeEdge("input", "branch2"),
      makeEdge("branch1", "output"),
      makeEdge("branch2", "output"),
    ];
    const { nodes: result } = arrangeNodes(nodes, edges);
    const b1 = result.find((n) => n.id === "branch1")!;
    const b2 = result.find((n) => n.id === "branch2")!;
    // Parallel siblings should be at different y positions
    expect(b1.position.y).not.toBe(b2.position.y);
  });
});
