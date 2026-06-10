import { describe, expect, it } from "vitest";
import { BabyResearch, GetWeather } from "./index";

describe("GetWeather example", () => {
  it("returns a workflow object", () => {
    const { workflow } = GetWeather();
    expect(workflow.name).toBe("Get Weather");
    expect(workflow.isPublished).toBe(true);
  });

  it("returns non-empty nodes array", () => {
    const { nodes } = GetWeather();
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("every node has an id and kind", () => {
    const { nodes } = GetWeather();
    for (const node of nodes) {
      expect(node.id).toBeDefined();
      expect(node.kind).toBeDefined();
    }
  });

  it("returns edges array", () => {
    const { edges } = GetWeather();
    expect(Array.isArray(edges)).toBe(true);
  });

  it("every edge has a generated id", () => {
    const { edges } = GetWeather();
    for (const edge of edges) {
      expect(edge.id).toBeDefined();
      expect(typeof edge.id).toBe("string");
      expect(edge.id!.length).toBeGreaterThan(0);
    }
  });

  it("returns different edge ids on each call (UUID generation)", () => {
    const first = GetWeather();
    const second = GetWeather();
    if (first.edges.length > 0 && second.edges.length > 0) {
      expect(first.edges[0].id).not.toBe(second.edges[0].id);
    }
  });

  it("has an input node", () => {
    const { nodes } = GetWeather();
    expect(nodes.some((n) => n.kind === "input")).toBe(true);
  });
});

describe("BabyResearch example", () => {
  it("returns a workflow object", () => {
    const { workflow } = BabyResearch();
    expect(workflow.name).toBe("baby-research");
    expect(workflow.isPublished).toBe(true);
  });

  it("returns non-empty nodes array", () => {
    const { nodes } = BabyResearch();
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("every node has an id and kind", () => {
    const { nodes } = BabyResearch();
    for (const node of nodes) {
      expect(node.id).toBeDefined();
      expect(node.kind).toBeDefined();
    }
  });

  it("returns edges array", () => {
    const { edges } = BabyResearch();
    expect(Array.isArray(edges)).toBe(true);
    expect(edges.length).toBeGreaterThan(0);
  });

  it("includes multiple node kinds (tool, llm, input, etc.)", () => {
    const { nodes } = BabyResearch();
    const kinds = new Set(nodes.map((n) => n.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("has an input node", () => {
    const { nodes } = BabyResearch();
    expect(nodes.some((n) => n.kind === "input")).toBe(true);
  });

  it("has an output node", () => {
    const { nodes } = BabyResearch();
    expect(nodes.some((n) => n.kind === "output")).toBe(true);
  });
});

describe("GetWeather and BabyResearch — shared invariants", () => {
  it("both workflows are published", () => {
    expect(GetWeather().workflow.isPublished).toBe(true);
    expect(BabyResearch().workflow.isPublished).toBe(true);
  });

  it("both have non-empty workflow names", () => {
    expect(typeof GetWeather().workflow.name).toBe("string");
    expect(GetWeather().workflow.name?.length).toBeGreaterThan(0);
    expect(typeof BabyResearch().workflow.name).toBe("string");
    expect(BabyResearch().workflow.name?.length).toBeGreaterThan(0);
  });

  it("both have at least 2 nodes", () => {
    expect(GetWeather().nodes.length).toBeGreaterThanOrEqual(2);
    expect(BabyResearch().nodes.length).toBeGreaterThanOrEqual(2);
  });

  it("every node id is unique within each workflow", () => {
    for (const fn of [GetWeather, BabyResearch]) {
      const { nodes } = fn();
      const ids = nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every edge id is unique within each workflow", () => {
    for (const fn of [GetWeather, BabyResearch]) {
      const { edges } = fn();
      const ids = edges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("GetWeather — edge connectivity", () => {
  it("all edge source and target ids reference existing node ids", () => {
    const { nodes, edges } = GetWeather();
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      expect(
        nodeIds.has(edge.source),
        `edge source ${edge.source} not in nodes`,
      ).toBe(true);
      expect(
        nodeIds.has(edge.target),
        `edge target ${edge.target} not in nodes`,
      ).toBe(true);
    }
  });

  it("workflow object has a name string", () => {
    const { workflow } = GetWeather();
    expect(typeof workflow.name).toBe("string");
    expect(workflow.name?.length).toBeGreaterThan(0);
  });

  it("BabyResearch has at least 3 nodes", () => {
    expect(BabyResearch().nodes.length).toBeGreaterThanOrEqual(3);
  });

  it("BabyResearch all edge source/target ids reference existing node ids", () => {
    const { nodes, edges } = BabyResearch();
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const edge of edges) {
      expect(
        nodeIds.has(edge.source),
        `edge source ${edge.source} not found`,
      ).toBe(true);
      expect(
        nodeIds.has(edge.target),
        `edge target ${edge.target} not found`,
      ).toBe(true);
    }
  });
});

describe("workflow examples — structural invariants", () => {
  it("GetWeather has at least one edge", () => {
    const { edges } = GetWeather();
    expect(edges.length).toBeGreaterThan(0);
  });

  it("BabyResearch has at least one edge", () => {
    const { edges } = BabyResearch();
    expect(edges.length).toBeGreaterThan(0);
  });

  it("GetWeather result has workflow, nodes, and edges properties", () => {
    const result = GetWeather();
    expect(result).toHaveProperty("workflow");
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
  });

  it("BabyResearch result has workflow, nodes, and edges properties", () => {
    const result = BabyResearch();
    expect(result).toHaveProperty("workflow");
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
  });
});
