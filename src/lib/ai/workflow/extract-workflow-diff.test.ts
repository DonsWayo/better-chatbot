import { describe, it, expect } from "vitest";
import { Edge } from "@xyflow/react";
import { extractWorkflowDiff } from "./extract-workflow-diff";
import { UINode, NodeKind } from "./workflow.interface";

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

describe("extractWorkflowDiff", () => {

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

describe("extractWorkflowDiff — additional", () => {
  const makeNode = (id: string, name: string): UINode => ({
    id,
    type: "default",
    position: { x: 0, y: 0 },
    data: {
      id,
      name,
      kind: NodeKind.Input,
      outputSchema: { type: "object", properties: {} },
      runtime: {},
    },
  } as unknown as UINode);

  it("adding a node appears in updateNodes when base is empty", () => {
    const result = extractWorkflowDiff(
      { nodes: [], edges: [] },
      { nodes: [makeNode("new-1", "New")], edges: [] },
    );
    expect(result.updateNodes.map((n) => n.id)).toContain("new-1");
  });

  it("removing a node appears in deleteNodes", () => {
    const result = extractWorkflowDiff(
      { nodes: [makeNode("del-1", "Old")], edges: [] },
      { nodes: [], edges: [] },
    );
    expect(result.deleteNodes.map((n) => n.id)).toContain("del-1");
  });

  it("unchanged node does not appear in deleteNodes or updateNodes when unchanged", () => {
    const node = makeNode("stable", "Stable");
    const result = extractWorkflowDiff(
      { nodes: [node], edges: [] },
      { nodes: [node], edges: [] },
    );
    expect(result.deleteNodes.map((n) => n.id)).not.toContain("stable");
    expect(result.updateNodes.map((n) => n.id)).not.toContain("stable");
  });

  it("result keys are exactly deleteNodes, deleteEdges, updateNodes, updateEdges", () => {
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, { nodes: [], edges: [] });
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(["deleteEdges", "deleteNodes", "updateEdges", "updateNodes"]);
  });
});

describe("extractWorkflowDiff — return type invariants", () => {
  const n = (id: string): UINode => createTestNode(id, id);
  const e = (id: string, s: string, t: string): Edge => createTestEdge(id, s, t);

  it("result always has deleteNodes, deleteEdges, updateNodes, updateEdges", () => {
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, { nodes: [], edges: [] });
    expect(result).toHaveProperty("deleteNodes");
    expect(result).toHaveProperty("deleteEdges");
    expect(result).toHaveProperty("updateNodes");
    expect(result).toHaveProperty("updateEdges");
  });

  it("all four fields are arrays", () => {
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, { nodes: [], edges: [] });
    expect(Array.isArray(result.deleteNodes)).toBe(true);
    expect(Array.isArray(result.deleteEdges)).toBe(true);
    expect(Array.isArray(result.updateNodes)).toBe(true);
    expect(Array.isArray(result.updateEdges)).toBe(true);
  });

  it("identical inputs produce empty diff", () => {
    const nodes = [n("n1")];
    const edges = [e("e1", "n1", "n2")];
    const result = extractWorkflowDiff({ nodes, edges }, { nodes, edges });
    expect(result.deleteNodes).toHaveLength(0);
    expect(result.deleteEdges).toHaveLength(0);
    expect(result.updateNodes).toHaveLength(0);
    expect(result.updateEdges).toHaveLength(0);
  });
});

describe("extractWorkflowDiff — edge case invariants", () => {
  it("empty to non-empty adds all as updates", () => {
    const nodes = [createTestNode("n1", "N1")];
    const edges = [createTestEdge("e1", "n1", "n2")];
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, { nodes, edges });
    expect(result.updateNodes).toHaveLength(1);
    expect(result.updateEdges).toHaveLength(1);
    expect(result.deleteNodes).toHaveLength(0);
    expect(result.deleteEdges).toHaveLength(0);
  });

  it("non-empty to empty deletes everything", () => {
    const nodes = [createTestNode("n1", "N1"), createTestNode("n2", "N2")];
    const edges = [createTestEdge("e1", "n1", "n2")];
    const result = extractWorkflowDiff({ nodes, edges }, { nodes: [], edges: [] });
    expect(result.deleteNodes).toHaveLength(2);
    expect(result.deleteEdges).toHaveLength(1);
    expect(result.updateNodes).toHaveLength(0);
    expect(result.updateEdges).toHaveLength(0);
  });

  it("node id appears exactly once in deleteNodes or updateNodes, not both", () => {
    const old = { nodes: [createTestNode("n1", "old")], edges: [] };
    const next = { nodes: [createTestNode("n1", "new")], edges: [] };
    const result = extractWorkflowDiff(old, next);
    const allIds = [...result.deleteNodes, ...result.updateNodes].map((n) => n.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("updating position of a node produces it in updateNodes", () => {
    const nodes = [createTestNode("n1", "N1", { x: 0, y: 0 })];
    const nodes2 = [createTestNode("n1", "N1", { x: 100, y: 200 })];
    const result = extractWorkflowDiff({ nodes, edges: [] }, { nodes: nodes2, edges: [] });
    expect(result.updateNodes.some((n) => n.id === "n1")).toBe(true);
  });

  it("unchanged edges produce no updates or deletes", () => {
    const edges = [createTestEdge("e1", "a", "b")];
    const nodes = [createTestNode("n1", "N1")];
    const result = extractWorkflowDiff({ nodes, edges }, { nodes, edges });
    expect(result.updateEdges).toHaveLength(0);
    expect(result.deleteEdges).toHaveLength(0);
  });

  it("swapping source/target of edge is detected as update", () => {
    const old = { nodes: [], edges: [createTestEdge("e1", "a", "b")] };
    const next = { nodes: [], edges: [createTestEdge("e1", "b", "a")] };
    const result = extractWorkflowDiff(old, next);
    expect(result.updateEdges.some((e) => e.id === "e1")).toBe(true);
  });

  it("completely different sets produce only deletes and updates (no shared keys)", () => {
    const old = { nodes: [createTestNode("n1", "N1")], edges: [createTestEdge("e1", "n1", "n2")] };
    const next = { nodes: [createTestNode("n2", "N2")], edges: [createTestEdge("e2", "n2", "n3")] };
    const result = extractWorkflowDiff(old, next);
    expect(result.deleteNodes.some((n) => n.id === "n1")).toBe(true);
    expect(result.updateNodes.some((n) => n.id === "n2")).toBe(true);
  });

  it("function returns a non-null object", () => {
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, { nodes: [], edges: [] });
    expect(result).not.toBeNull();
    expect(typeof result).toBe("object");
  });

  it("deleteNodes items each have an id", () => {
    const old = { nodes: [createTestNode("x", "X")], edges: [] };
    const result = extractWorkflowDiff(old, { nodes: [], edges: [] });
    for (const n of result.deleteNodes) {
      expect(n).toHaveProperty("id");
    }
  });

  it("updateNodes items each have an id", () => {
    const next = { nodes: [createTestNode("y", "Y")], edges: [] };
    const result = extractWorkflowDiff({ nodes: [], edges: [] }, next);
    for (const n of result.updateNodes) {
      expect(n).toHaveProperty("id");
    }
  });
});
