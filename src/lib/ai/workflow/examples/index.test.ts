import { describe, it, expect } from "vitest";
import { GetWeather, BabyResearch } from "./index";

describe("GetWeather factory", () => {
  it("returns an object with workflow, nodes, and edges", () => {
    const result = GetWeather();
    expect(result).toHaveProperty("workflow");
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
  });

  it("workflow has expected fields", () => {
    const { workflow } = GetWeather();
    expect(workflow.name).toBe("Get Weather");
    expect(workflow.isPublished).toBe(true);
    expect(workflow.visibility).toBe("private");
    expect(typeof workflow.description).toBe("string");
    expect(workflow.description!.length).toBeGreaterThan(0);
  });

  it("workflow has an emoji icon", () => {
    const { workflow } = GetWeather();
    expect(workflow.icon?.type).toBe("emoji");
    expect(typeof workflow.icon?.value).toBe("string");
  });

  it("nodes is an array", () => {
    const { nodes } = GetWeather();
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("edges is an array with generated UUIDs", () => {
    const { edges } = GetWeather();
    expect(Array.isArray(edges)).toBe(true);
  });

  it("edges have unique IDs on each call", () => {
    const r1 = GetWeather();
    const r2 = GetWeather();
    const ids1 = r1.edges.map((e) => e.id);
    const ids2 = r2.edges.map((e) => e.id);
    expect(ids1).not.toEqual(ids2);
  });
});

describe("BabyResearch factory", () => {
  it("returns an object with workflow, nodes, and edges", () => {
    const result = BabyResearch();
    expect(result).toHaveProperty("workflow");
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
  });

  it("workflow has expected fields", () => {
    const { workflow } = BabyResearch();
    expect(workflow.name).toBe("baby-research");
    expect(workflow.isPublished).toBe(true);
    expect(workflow.visibility).toBe("private");
    expect(typeof workflow.description).toBe("string");
    expect(workflow.description!.length).toBeGreaterThan(0);
  });

  it("workflow has an emoji icon", () => {
    const { workflow } = BabyResearch();
    expect(workflow.icon?.type).toBe("emoji");
    expect(typeof workflow.icon?.value).toBe("string");
  });

  it("nodes is an array with content", () => {
    const { nodes } = BabyResearch();
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it("edges have unique IDs on each call", () => {
    const r1 = BabyResearch();
    const r2 = BabyResearch();
    const ids1 = r1.edges.map((e) => e.id);
    const ids2 = r2.edges.map((e) => e.id);
    expect(ids1).not.toEqual(ids2);
  });

  it("edges all have id set", () => {
    const { edges } = BabyResearch();
    for (const edge of edges) {
      expect(typeof edge.id).toBe("string");
      expect(edge.id!.length).toBeGreaterThan(0);
    }
  });
});
