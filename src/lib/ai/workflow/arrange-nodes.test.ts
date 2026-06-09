import { describe, it, expect } from "vitest";
import { arrangeNodes } from "./arrange-nodes";
import { NodeKind } from "./workflow.interface";
import type { UINode } from "./workflow.interface";
import type { Edge } from "@xyflow/react";

const makeNode = (
  id: string,
  kind: NodeKind,
  position = { x: 0, y: 0 },
): UINode =>
  ({
    id,
    type: "custom",
    position,
    data: {
      id,
      name: id,
      kind,
      outputSchema: { type: "object", properties: {} },
    },
  }) as unknown as UINode;

const makeEdge = (source: string, target: string, sourceHandle?: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: sourceHandle ?? null,
});

describe("arrangeNodes", () => {
  describe("no input node", () => {
    it("returns nodes unchanged when there is no Input node", () => {
      const nodes = [makeNode("n1", NodeKind.LLM), makeNode("n2", NodeKind.Output)];
      const edges = [makeEdge("n1", "n2")];
      const { nodes: result } = arrangeNodes(nodes, edges);
      expect(result[0].position).toEqual(nodes[0].position);
      expect(result[1].position).toEqual(nodes[1].position);
    });

    it("returns all nodes even when none have edges", () => {
      const nodes = [makeNode("n1", NodeKind.LLM)];
      const { nodes: result } = arrangeNodes(nodes, []);
      expect(result).toHaveLength(1);
    });
  });

  describe("single input-output chain", () => {
    it("places input node at x=0", () => {
      const input = makeNode("in", NodeKind.Input);
      const output = makeNode("out", NodeKind.Output);
      const edges = [makeEdge("in", "out")];
      const { nodes: result } = arrangeNodes([input, output], edges);
      const resultInput = result.find((n) => n.id === "in")!;
      expect(resultInput.position.x).toBe(0);
    });

    it("places the connected output node at a positive x", () => {
      const input = makeNode("in", NodeKind.Input);
      const output = makeNode("out", NodeKind.Output);
      const edges = [makeEdge("in", "out")];
      const { nodes: result } = arrangeNodes([input, output], edges);
      const resultOut = result.find((n) => n.id === "out")!;
      expect(resultOut.position.x).toBeGreaterThan(0);
    });

    it("output node x is one LEVEL_GAP (360) away from input", () => {
      const input = makeNode("in", NodeKind.Input);
      const output = makeNode("out", NodeKind.Output);
      const edges = [makeEdge("in", "out")];
      const { nodes: result } = arrangeNodes([input, output], edges);
      const resultOut = result.find((n) => n.id === "out")!;
      expect(resultOut.position.x).toBe(360);
    });
  });

  describe("linear three-node chain", () => {
    it("assigns increasing x values along the chain", () => {
      const in1 = makeNode("in", NodeKind.Input);
      const llm = makeNode("llm", NodeKind.LLM);
      const out = makeNode("out", NodeKind.Output);
      const edges = [makeEdge("in", "llm"), makeEdge("llm", "out")];
      const { nodes: result } = arrangeNodes([in1, llm, out], edges);
      const xIn = result.find((n) => n.id === "in")!.position.x;
      const xLlm = result.find((n) => n.id === "llm")!.position.x;
      const xOut = result.find((n) => n.id === "out")!.position.x;
      expect(xIn).toBeLessThan(xLlm);
      expect(xLlm).toBeLessThan(xOut);
    });

    it("each step is exactly one LEVEL_GAP apart", () => {
      const in1 = makeNode("in", NodeKind.Input);
      const llm = makeNode("llm", NodeKind.LLM);
      const out = makeNode("out", NodeKind.Output);
      const edges = [makeEdge("in", "llm"), makeEdge("llm", "out")];
      const { nodes: result } = arrangeNodes([in1, llm, out], edges);
      const xLlm = result.find((n) => n.id === "llm")!.position.x;
      const xOut = result.find((n) => n.id === "out")!.position.x;
      expect(xOut - xLlm).toBe(360);
    });
  });

  describe("branching from input node", () => {
    it("both children get the same x level (1 step from input)", () => {
      const in1 = makeNode("in", NodeKind.Input);
      const a = makeNode("a", NodeKind.LLM);
      const b = makeNode("b", NodeKind.LLM);
      const edges = [makeEdge("in", "a"), makeEdge("in", "b")];
      const { nodes: result } = arrangeNodes([in1, a, b], edges);
      const xA = result.find((n) => n.id === "a")!.position.x;
      const xB = result.find((n) => n.id === "b")!.position.x;
      expect(xA).toBe(360);
      expect(xB).toBe(360);
    });

    it("two siblings have different y positions (no overlap)", () => {
      const in1 = makeNode("in", NodeKind.Input);
      const a = makeNode("a", NodeKind.LLM, { x: 0, y: 0 });
      const b = makeNode("b", NodeKind.LLM, { x: 0, y: 0 });
      const edges = [makeEdge("in", "a"), makeEdge("in", "b")];
      const { nodes: result } = arrangeNodes([in1, a, b], edges);
      const yA = result.find((n) => n.id === "a")!.position.y;
      const yB = result.find((n) => n.id === "b")!.position.y;
      expect(yA).not.toBe(yB);
    });
  });

  describe("isolated nodes (no edges)", () => {
    it("returns isolated node with its original position", () => {
      const in1 = makeNode("in", NodeKind.Input, { x: 0, y: 0 });
      const isolated = makeNode("iso", NodeKind.Note, { x: 999, y: 888 });
      const connected = makeNode("out", NodeKind.Output);
      const edges = [makeEdge("in", "out")];
      const { nodes: result } = arrangeNodes([in1, isolated, connected], edges);
      const iso = result.find((n) => n.id === "iso")!;
      expect(iso.position).toEqual({ x: 999, y: 888 });
    });
  });

  describe("empty inputs", () => {
    it("returns empty array for no nodes", () => {
      const { nodes: result } = arrangeNodes([], []);
      expect(result).toEqual([]);
    });

    it("returns nodes unchanged for no edges", () => {
      const nodes = [
        makeNode("in", NodeKind.Input, { x: 5, y: 10 }),
        makeNode("out", NodeKind.Output, { x: 100, y: 200 }),
      ];
      const { nodes: result } = arrangeNodes(nodes, []);
      expect(result[0].position).toEqual({ x: 5, y: 10 });
      expect(result[1].position).toEqual({ x: 100, y: 200 });
    });
  });

  describe("condition node sourceHandle sorting", () => {
    it("processes if/else branches without error and returns correct node count", () => {
      const in1 = makeNode("in", NodeKind.Input);
      const cond = makeNode("cond", NodeKind.Condition);
      const ifBranch = makeNode("if-branch", NodeKind.LLM, { x: 0, y: 0 });
      const elseBranch = makeNode("else-branch", NodeKind.LLM, { x: 0, y: 200 });
      const edges = [
        makeEdge("in", "cond"),
        makeEdge("cond", "if-branch", "if"),
        makeEdge("cond", "else-branch", "else"),
      ];
      const { nodes: result } = arrangeNodes([in1, cond, ifBranch, elseBranch], edges);
      expect(result).toHaveLength(4);
      // both branches share same x level (2 steps from input)
      const xIf = result.find((n) => n.id === "if-branch")!.position.x;
      const xElse = result.find((n) => n.id === "else-branch")!.position.x;
      expect(xIf).toBe(720); // 2 * LEVEL_GAP
      expect(xElse).toBe(720);
    });

    it("nodes with lower originalY get placed at lower y positions", () => {
      // Within a parent group, nodes are sorted by originalY then placed top-down
      const in1 = makeNode("in", NodeKind.Input);
      const cond = makeNode("cond", NodeKind.Condition);
      // ifBranch has lower originalY so it goes first
      const ifBranch = makeNode("if-branch", NodeKind.LLM, { x: 0, y: 0 });
      const elseBranch = makeNode("else-branch", NodeKind.LLM, { x: 0, y: 500 });
      const edges = [
        makeEdge("in", "cond"),
        makeEdge("cond", "if-branch", "if"),
        makeEdge("cond", "else-branch", "else"),
      ];
      const { nodes: result } = arrangeNodes([in1, cond, ifBranch, elseBranch], edges);
      const yIf = result.find((n) => n.id === "if-branch")!.position.y;
      const yElse = result.find((n) => n.id === "else-branch")!.position.y;
      // if-branch (originalY=0) placed before else-branch (originalY=500)
      expect(yIf).toBeLessThan(yElse);
    });
  });

  describe("return shape", () => {
    it("always returns an object with a nodes array", () => {
      const result = arrangeNodes([], []);
      expect(result).toHaveProperty("nodes");
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    it("returned nodes count matches input nodes count", () => {
      const nodes = [
        makeNode("in", NodeKind.Input),
        makeNode("llm", NodeKind.LLM),
        makeNode("out", NodeKind.Output),
      ];
      const edges = [makeEdge("in", "llm"), makeEdge("llm", "out")];
      const { nodes: result } = arrangeNodes(nodes, edges);
      expect(result).toHaveLength(nodes.length);
    });

    it("each result node retains its original id", () => {
      const nodes = [makeNode("in", NodeKind.Input), makeNode("out", NodeKind.Output)];
      const edges = [makeEdge("in", "out")];
      const { nodes: result } = arrangeNodes(nodes, edges);
      const ids = result.map((n) => n.id).sort();
      expect(ids).toEqual(["in", "out"]);
    });
  });
});
