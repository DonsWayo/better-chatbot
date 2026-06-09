import { describe, it, expect } from "vitest";
import { addEdgeBranchLabel } from "./add-edge-branch-label";
import { NodeKind } from "../workflow.interface";

function makeNode(id: string, kind: string): any {
  return {
    id,
    kind,
    workflowId: "wf-1",
    name: id,
    description: "",
    nodeConfig: {},
    uiConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEdge(source: string, target: string, sourceHandle?: string): any {
  return {
    id: `${source}->${target}`,
    workflowId: "wf-1",
    source,
    target,
    uiConfig: { sourceHandle },
    createdAt: new Date(),
  };
}

describe("addEdgeBranchLabel", () => {
  it("labels single linear chain with B0", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("llm", NodeKind.LLM),
      makeNode("output", NodeKind.Output),
    ];
    const edges = [
      makeEdge("input", "llm"),
      makeEdge("llm", "output"),
    ];
    addEdgeBranchLabel(nodes, edges);
    expect(edges[0].uiConfig.label).toBe("B0");
    expect(edges[1].uiConfig.label).toBe("B0");
  });

  it("labels parallel branches with B0.0 and B0.1", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("a", NodeKind.LLM),
      makeNode("b", NodeKind.LLM),
    ];
    const edges = [
      makeEdge("input", "a"),
      makeEdge("input", "b"),
    ];
    addEdgeBranchLabel(nodes, edges);
    const labels = edges.map((e) => e.uiConfig.label).sort();
    expect(labels).toContain("B0.0");
    expect(labels).toContain("B0.1");
  });

  it("skips edges that already have a label", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("llm", NodeKind.LLM),
    ];
    const edges = [makeEdge("input", "llm")];
    edges[0].uiConfig.label = "EXISTING";
    addEdgeBranchLabel(nodes, edges);
    expect(edges[0].uiConfig.label).toBe("EXISTING");
  });

  it("handles condition node with single edge per handle", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("cond", NodeKind.Condition),
      makeNode("true-path", NodeKind.LLM),
      makeNode("false-path", NodeKind.LLM),
    ];
    const edges = [
      makeEdge("input", "cond"),
      makeEdge("cond", "true-path", "if"),
      makeEdge("cond", "false-path", "else"),
    ];
    addEdgeBranchLabel(nodes, edges);
    // input→cond should get labeled
    expect(edges[0].uiConfig.label).toBeTruthy();
    // condition edges should get labels from their handles
    expect(edges[1].uiConfig.label).toBeTruthy();
    expect(edges[2].uiConfig.label).toBeTruthy();
  });

  it("does not throw for a single input→output workflow", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("output", NodeKind.Output),
    ];
    const edges = [makeEdge("input", "output")];
    expect(() => addEdgeBranchLabel(nodes, edges)).not.toThrow();
    expect(edges[0].uiConfig.label).toBe("B0");
  });

  it("does not throw for empty edges with nodes", () => {
    const nodes = [makeNode("input", NodeKind.Input), makeNode("output", NodeKind.Output)];
    expect(() => addEdgeBranchLabel(nodes, [])).not.toThrow();
  });

  it("all labeled edges have non-empty string labels", () => {
    const nodes = [
      makeNode("input", NodeKind.Input),
      makeNode("llm", NodeKind.LLM),
      makeNode("output", NodeKind.Output),
    ];
    const edges = [makeEdge("input", "llm"), makeEdge("llm", "output")];
    addEdgeBranchLabel(nodes, edges);
    for (const edge of edges) {
      expect(typeof edge.uiConfig.label).toBe("string");
      expect(edge.uiConfig.label!.length).toBeGreaterThan(0);
    }
  });

  it("linear chain of 3 nodes — all edges get B0 label", () => {
    const nodes = [
      makeNode("n1", NodeKind.Input),
      makeNode("n2", NodeKind.LLM),
      makeNode("n3", NodeKind.Output),
    ];
    const edges = [makeEdge("n1", "n2"), makeEdge("n2", "n3")];
    addEdgeBranchLabel(nodes, edges);
    expect(edges.every((e) => e.uiConfig.label === "B0")).toBe(true);
  });

  it("function returns void (mutates in-place)", () => {
    const nodes: DBNode[] = [
      createNode("start", NodeKind.Input, "Start"),
      createNode("end", NodeKind.Output, "End"),
    ];
    const edges: DBEdge[] = [createEdge("e1", "start", "end")];
    const result = addEdgeBranchLabel(nodes, edges);
    expect(result).toBeUndefined();
  });

  it("assigned labels are strings", () => {
    const nodes: DBNode[] = [
      createNode("start", NodeKind.Input, "Start"),
      createNode("llm1", NodeKind.LLM, "LLM1"),
      createNode("end", NodeKind.Output, "End"),
    ];
    const edges: DBEdge[] = [
      createEdge("e1", "start", "llm1"),
      createEdge("e2", "llm1", "end"),
    ];
    addEdgeBranchLabel(nodes, edges);
    for (const edge of edges) {
      if (edge.uiConfig.label !== undefined) {
        expect(typeof edge.uiConfig.label).toBe("string");
      }
    }
  });

  it("empty edges array is left unchanged", () => {
    const nodes: DBNode[] = [createNode("start", NodeKind.Input, "Start")];
    const edges: DBEdge[] = [];
    addEdgeBranchLabel(nodes, edges);
    expect(edges).toHaveLength(0);
  });
});
