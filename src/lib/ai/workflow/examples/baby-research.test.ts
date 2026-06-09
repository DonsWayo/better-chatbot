import { describe, it, expect } from "vitest";
import { babyResearchNodes, babyResearchEdges } from "./baby-research";

describe("babyResearchNodes", () => {
  it("exports a non-empty array", () => {
    expect(Array.isArray(babyResearchNodes)).toBe(true);
    expect(babyResearchNodes.length).toBeGreaterThan(0);
  });

  it("every node has an id string", () => {
    for (const node of babyResearchNodes) {
      expect(typeof node.id).toBe("string");
      expect((node.id as string).length).toBeGreaterThan(0);
    }
  });

  it("all node ids are unique", () => {
    const ids = babyResearchNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every node has a kind", () => {
    for (const node of babyResearchNodes) {
      expect(typeof node.kind).toBe("string");
    }
  });

  it("every node has a name", () => {
    for (const node of babyResearchNodes) {
      expect(typeof node.name).toBe("string");
    }
  });

  it("includes input and output nodes", () => {
    const kinds = babyResearchNodes.map((n) => n.kind);
    expect(kinds).toContain("input");
    expect(kinds).toContain("output");
  });

  it("includes llm nodes for analysis and summary", () => {
    const kinds = babyResearchNodes.map((n) => n.kind);
    expect(kinds).toContain("llm");
  });

  it("includes tool nodes for web search", () => {
    const kinds = babyResearchNodes.map((n) => n.kind);
    expect(kinds).toContain("tool");
  });

  it("includes condition nodes for branching", () => {
    const kinds = babyResearchNodes.map((n) => n.kind);
    expect(kinds).toContain("condition");
  });

  it("every node has a uiConfig with position", () => {
    for (const node of babyResearchNodes) {
      expect(node.uiConfig).toBeDefined();
      expect(node.uiConfig?.position).toBeDefined();
      expect(typeof node.uiConfig?.position?.x).toBe("number");
      expect(typeof node.uiConfig?.position?.y).toBe("number");
    }
  });

  it("every node has a nodeConfig", () => {
    for (const node of babyResearchNodes) {
      expect(node.nodeConfig).toBeDefined();
    }
  });

  it("input node has outputSchema with research_instruction field", () => {
    const inputNode = babyResearchNodes.find((n) => n.kind === "input");
    const schema = inputNode?.nodeConfig?.outputSchema as { properties?: { research_instruction?: unknown } };
    expect(schema?.properties?.research_instruction).toBeDefined();
  });
});

describe("babyResearchEdges", () => {
  it("exports a non-empty array", () => {
    expect(Array.isArray(babyResearchEdges)).toBe(true);
    expect(babyResearchEdges.length).toBeGreaterThan(0);
  });

  it("every edge has source and target", () => {
    for (const edge of babyResearchEdges) {
      expect(typeof edge.source).toBe("string");
      expect(typeof edge.target).toBe("string");
    }
  });

  it("edge sources and targets reference valid node ids", () => {
    const nodeIds = new Set(babyResearchNodes.map((n) => n.id));
    for (const edge of babyResearchEdges) {
      expect(nodeIds.has(edge.source!)).toBe(true);
      expect(nodeIds.has(edge.target!)).toBe(true);
    }
  });

  it("output node has incoming edges", () => {
    const outputNode = babyResearchNodes.find((n) => n.kind === "output");
    const edgeTargets = babyResearchEdges.map((e) => e.target);
    expect(edgeTargets).toContain(outputNode!.id);
  });

  it("input node has outgoing edges", () => {
    const inputNode = babyResearchNodes.find((n) => n.kind === "input");
    const edgeSources = babyResearchEdges.map((e) => e.source);
    expect(edgeSources).toContain(inputNode!.id);
  });
});
