import { describe, it, expect } from "vitest";
import { Edge } from "@xyflow/react";
import { extractWorkflowDiff } from "./extract-workflow-diff";
import { UINode, NodeKind } from "./workflow.interface";

describe("extractWorkflowDiff", () => {
  const createTestNode = (
    id: string,
    name: string,
    position = { x: 0, y: 0 },
  ): UINode => ({
    id,
    type: "default",
    position,
    data: {
      id,
      name,
      kind: NodeKind.Input,
      outputSchema: { type: "object", properties: {} },
      runtime: {},
    },
  });

  const createTestEdge = (
    id: string,
    source: string,
    target: string,
  ): Edge => ({
    id,
    source,
    target,
  });

  it("should detect added nodes and edges", () => {
    const oldData = {
      nodes: [createTestNode("node1", "Node 1")],
      edges: [createTestEdge("edge1", "node1", "node2")],
    };

    const newData = {
      nodes: [
        createTestNode("node1", "Node 1"),
        createTestNode("node2", "Node 2", { x: 100, y: 100 }),
      ],
      edges: [
        createTestEdge("edge1", "node1", "node2"),
        createTestEdge("edge2", "node2", "node3"),
      ],
    };

    const result = extractWorkflowDiff(oldData, newData);

    expect(result.deleteNodes).toHaveLength(0);
    expect(result.deleteEdges).toHaveLength(0);
    expect(result.updateNodes).toHaveLength(1);
    expect(result.updateEdges).toHaveLength(1);
    expect(result.updateNodes[0].id).toBe("node2");
    expect(result.updateEdges[0].id).toBe("edge2");
  });

  it("should detect deleted and updated nodes and edges", () => {
    const oldData = {
      nodes: [
        createTestNode("node1", "Node 1"),
        createTestNode("node2", "Node 2"),
        createTestNode("node3", "Node 3", { x: 50, y: 50 }),
      ],
      edges: [
        createTestEdge("edge1", "node1", "node2"),
        createTestEdge("edge2", "node2", "node3"),
      ],
    };

    const newData = {
      nodes: [
        createTestNode("node1", "Node 1 Updated", { x: 10, y: 10 }),
        createTestNode("node3", "Node 3", { x: 50, y: 50 }),
      ],
      edges: [createTestEdge("edge1", "node1", "node3")],
    };

    const result = extractWorkflowDiff(oldData, newData);

    expect(result.deleteNodes).toHaveLength(1);
    expect(result.deleteNodes[0].id).toBe("node2");
    expect(result.deleteEdges).toHaveLength(1);
    expect(result.deleteEdges[0].id).toBe("edge2");
    expect(result.updateNodes).toHaveLength(1);
    expect(result.updateNodes[0].id).toBe("node1");
    expect(result.updateEdges).toHaveLength(1);
    expect(result.updateEdges[0].id).toBe("edge1");
  });

  it("returns empty diff when inputs are identical", () => {
    const data = {
      nodes: [createTestNode("n1", "Node 1"), createTestNode("n2", "Node 2")],
      edges: [createTestEdge("e1", "n1", "n2")],
    };
    const result = extractWorkflowDiff(data, data);
    expect(result.deleteNodes).toHaveLength(0);
    expect(result.deleteEdges).toHaveLength(0);
    expect(result.updateNodes).toHaveLength(0);
    expect(result.updateEdges).toHaveLength(0);
  });

  it("all nodes become deleteNodes when new has no nodes", () => {
    const oldData = {
      nodes: [createTestNode("n1", "A"), createTestNode("n2", "B")],
      edges: [],
    };
    const result = extractWorkflowDiff(oldData, { nodes: [], edges: [] });
    expect(result.deleteNodes).toHaveLength(2);
    expect(result.updateNodes).toHaveLength(0);
  });

  it("all nodes become updateNodes when old is empty", () => {
    const newData = {
      nodes: [createTestNode("n1", "A"), createTestNode("n2", "B")],
      edges: [createTestEdge("e1", "n1", "n2")],
    };
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, newData);
    expect(result.updateNodes).toHaveLength(2);
    expect(result.updateEdges).toHaveLength(1);
    expect(result.deleteNodes).toHaveLength(0);
    expect(result.deleteEdges).toHaveLength(0);
  });

  it("unchanged nodes are not in update or delete lists", () => {
    const node = createTestNode("stable", "Stable Node");
    const data = { nodes: [node], edges: [] };
    const result = extractWorkflowDiff(data, data);
    expect(result.updateNodes.map((n) => n.id)).not.toContain("stable");
    expect(result.deleteNodes.map((n) => n.id)).not.toContain("stable");
  });

  it("result always has all four diff arrays", () => {
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, { nodes: [], edges: [] });
    expect(Array.isArray(result.deleteNodes)).toBe(true);
    expect(Array.isArray(result.deleteEdges)).toBe(true);
    expect(Array.isArray(result.updateNodes)).toBe(true);
    expect(Array.isArray(result.updateEdges)).toBe(true);
  });

  it("node name change is detected as an update", () => {
    const oldData = { nodes: [createTestNode("n1", "Old Name")], edges: [] };
    const newData = { nodes: [createTestNode("n1", "New Name")], edges: [] };
    const result = extractWorkflowDiff(oldData, newData);
    expect(result.updateNodes.map((n) => n.id)).toContain("n1");
    expect(result.deleteNodes).toHaveLength(0);
  });
});
