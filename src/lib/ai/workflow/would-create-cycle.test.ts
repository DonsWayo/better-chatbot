import type { Connection } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { wouldCreateCycle } from "./would-create-cycle";

type Edge = { source: string; target: string; id: string };

const conn = (source: string, target: string): Connection => ({
  source,
  target,
  sourceHandle: null,
  targetHandle: null,
});

describe("wouldCreateCycle", () => {
  it("returns false for empty graph", () => {
    expect(wouldCreateCycle(conn("A", "B"), [])).toBe(false);
  });

  it("returns false for simple linear chain", () => {
    const edges: Edge[] = [{ source: "A", target: "B", id: "e1" }];
    expect(wouldCreateCycle(conn("B", "C"), edges)).toBe(false);
  });

  it("detects direct self-loop (A → A)", () => {
    expect(wouldCreateCycle(conn("A", "A"), [])).toBe(true);
  });

  it("detects simple 2-node cycle (A→B, B→A)", () => {
    const edges: Edge[] = [{ source: "A", target: "B", id: "e1" }];
    expect(wouldCreateCycle(conn("B", "A"), edges)).toBe(true);
  });

  it("detects 3-node cycle (A→B→C→A)", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "B", target: "C", id: "e2" },
    ];
    expect(wouldCreateCycle(conn("C", "A"), edges)).toBe(true);
  });

  it("returns false for diamond shape adding no cycle", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "A", target: "C", id: "e2" },
      { source: "B", target: "D", id: "e3" },
    ];
    expect(wouldCreateCycle(conn("C", "D"), edges)).toBe(false);
  });

  it("returns false when source is empty string", () => {
    expect(wouldCreateCycle(conn("", "B"), [])).toBe(false);
  });

  it("returns false when target is empty string", () => {
    expect(wouldCreateCycle(conn("A", ""), [])).toBe(false);
  });

  it("returns false when source is null", () => {
    expect(wouldCreateCycle(conn(null as unknown as string, "B"), [])).toBe(
      false,
    );
  });

  it("returns false for disconnected components adding no cycle", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "C", target: "D", id: "e2" },
    ];
    expect(wouldCreateCycle(conn("B", "E"), edges)).toBe(false);
  });

  it("detects cycle in 5-node chain", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "B", target: "C", id: "e2" },
      { source: "C", target: "D", id: "e3" },
      { source: "D", target: "E", id: "e4" },
    ];
    expect(wouldCreateCycle(conn("E", "B"), edges)).toBe(true);
  });

  it("returns false for parallel paths with shared endpoint", () => {
    const edges: Edge[] = [
      { source: "start", target: "A", id: "e1" },
      { source: "start", target: "B", id: "e2" },
    ];
    expect(wouldCreateCycle(conn("A", "end"), edges)).toBe(false);
  });

  it("detects cycle when fan-out converges back to origin", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "A", target: "C", id: "e2" },
    ];
    // C → A creates a cycle (A reachable from itself via A→C→A)
    expect(wouldCreateCycle(conn("C", "A"), edges)).toBe(true);
  });

  it("returns false when duplicate edge direction is proposed", () => {
    const edges: Edge[] = [{ source: "A", target: "B", id: "e1" }];
    // Adding A→B again doesn't create a cycle
    expect(wouldCreateCycle(conn("A", "B"), edges)).toBe(false);
  });

  it("handles deeply nested graph without cycle", () => {
    const edges: Edge[] = Array.from({ length: 10 }, (_, i) => ({
      source: `N${i}`,
      target: `N${i + 1}`,
      id: `e${i}`,
    }));
    expect(wouldCreateCycle(conn(`N${10}`, `N${11}`), edges)).toBe(false);
  });

  it("detects cycle in deeply nested graph (close the loop)", () => {
    const edges: Edge[] = Array.from({ length: 10 }, (_, i) => ({
      source: `N${i}`,
      target: `N${i + 1}`,
      id: `e${i}`,
    }));
    expect(wouldCreateCycle(conn(`N${10}`, "N0"), edges)).toBe(true);
  });
});
