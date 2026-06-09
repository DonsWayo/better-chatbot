import { describe, it, expect } from "vitest";
import { getWeatherNodes, getWeatherEdges } from "./get-weather";

describe("getWeatherNodes", () => {
  it("exports an array of nodes", () => {
    expect(Array.isArray(getWeatherNodes)).toBe(true);
    expect(getWeatherNodes.length).toBeGreaterThan(0);
  });

  it("every node has an id string", () => {
    for (const node of getWeatherNodes) {
      expect(typeof node.id).toBe("string");
      expect((node.id as string).length).toBeGreaterThan(0);
    }
  });

  it("every node has a kind", () => {
    for (const node of getWeatherNodes) {
      expect(typeof node.kind).toBe("string");
    }
  });

  it("every node has a name", () => {
    for (const node of getWeatherNodes) {
      expect(typeof node.name).toBe("string");
    }
  });

  it("includes input and output nodes", () => {
    const kinds = getWeatherNodes.map((n) => n.kind);
    expect(kinds).toContain("input");
    expect(kinds).toContain("output");
  });

  it("includes an http node for weather api call", () => {
    const kinds = getWeatherNodes.map((n) => n.kind);
    expect(kinds).toContain("http");
  });

  it("includes an llm node for geocoding", () => {
    const kinds = getWeatherNodes.map((n) => n.kind);
    expect(kinds).toContain("llm");
  });

  it("all node ids are unique", () => {
    const ids = getWeatherNodes.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every node has uiConfig with position", () => {
    for (const node of getWeatherNodes) {
      expect(node.uiConfig).toBeDefined();
      expect(node.uiConfig?.position).toBeDefined();
      expect(typeof node.uiConfig?.position?.x).toBe("number");
      expect(typeof node.uiConfig?.position?.y).toBe("number");
    }
  });

  it("every node has a nodeConfig", () => {
    for (const node of getWeatherNodes) {
      expect(node.nodeConfig).toBeDefined();
    }
  });
});

describe("getWeatherEdges", () => {
  it("exports an array of edges", () => {
    expect(Array.isArray(getWeatherEdges)).toBe(true);
    expect(getWeatherEdges.length).toBeGreaterThan(0);
  });

  it("every edge has source and target", () => {
    for (const edge of getWeatherEdges) {
      expect(typeof edge.source).toBe("string");
      expect(typeof edge.target).toBe("string");
    }
  });

  it("edge sources and targets reference valid node ids", () => {
    const nodeIds = new Set(getWeatherNodes.map((n) => n.id));
    for (const edge of getWeatherEdges) {
      expect(nodeIds.has(edge.source!)).toBe(true);
      expect(nodeIds.has(edge.target!)).toBe(true);
    }
  });

  it("all edge source-target pairs are unique", () => {
    const pairs = getWeatherEdges.map((e) => `${e.source}->${e.target}`);
    const unique = new Set(pairs);
    expect(unique.size).toBe(pairs.length);
  });

  it("forms a connected pipeline from input to output", () => {
    const inputNode = getWeatherNodes.find((n) => n.kind === "input");
    const outputNode = getWeatherNodes.find((n) => n.kind === "output");
    const edgeSources = getWeatherEdges.map((e) => e.source);
    const edgeTargets = getWeatherEdges.map((e) => e.target);
    expect(edgeSources).toContain(inputNode!.id);
    expect(edgeTargets).toContain(outputNode!.id);
  });
});
