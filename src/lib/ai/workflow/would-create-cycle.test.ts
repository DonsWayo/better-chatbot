import { describe, it, expect } from "vitest";
import { wouldCreateCycle } from "./would-create-cycle";

type Edge = { source: string; target: string; id?: string };

describe("wouldCreateCycle", () => {
  it("returns false for empty graph", () => {
    expect(wouldCreateCycle({ source: "A", target: "B" }, [])).toBe(false);
  });

  it("returns false for simple linear chain", () => {
    const edges: Edge[] = [{ source: "A", target: "B", id: "e1" }];
    expect(wouldCreateCycle({ source: "B", target: "C" }, edges)).toBe(false);
  });

  it("detects direct self-loop (A → A)", () => {
    expect(wouldCreateCycle({ source: "A", target: "A" }, [])).toBe(true);
  });

  it("detects simple 2-node cycle (A→B, B→A)", () => {
    const edges: Edge[] = [{ source: "A", target: "B", id: "e1" }];
    expect(wouldCreateCycle({ source: "B", target: "A" }, edges)).toBe(true);
  });

  it("detects 3-node cycle (A→B→C→A)", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "B", target: "C", id: "e2" },
    ];
    expect(wouldCreateCycle({ source: "C", target: "A" }, edges)).toBe(true);
  });

  it("returns false for diamond shape adding no cycle", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "A", target: "C", id: "e2" },
      { source: "B", target: "D", id: "e3" },
    ];
    expect(wouldCreateCycle({ source: "C", target: "D" }, edges)).toBe(false);
  });

  it("returns false when source is empty string", () => {
    expect(wouldCreateCycle({ source: "", target: "B" }, [])).toBe(false);
  });

  it("returns false when target is empty string", () => {
    expect(wouldCreateCycle({ source: "A", target: "" }, [])).toBe(false);
  });

  it("returns false when source is null", () => {
    expect(wouldCreateCycle({ source: null as any, target: "B" }, [])).toBe(false);
  });

  it("returns false for disconnected components adding no cycle", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "C", target: "D", id: "e2" },
    ];
    expect(wouldCreateCycle({ source: "B", target: "E" }, edges)).toBe(false);
  });

  it("detects cycle in 5-node chain", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", id: "e1" },
      { source: "B", target: "C", id: "e2" },
      { source: "C", target: "D", id: "e3" },
      { source: "D", target: "E", id: "e4" },
    ];
    expect(wouldCreateCycle({ source: "E", target: "B" }, edges)).toBe(true);
  });

  it("returns false for parallel paths with shared endpoint", () => {
    const edges: Edge[] = [
      { source: "start", target: "A", id: "e1" },
      { source: "start", target: "B", id: "e2" },
    ];
    expect(wouldCreateCycle({ source: "A", target: "end" }, edges)).toBe(false);
  });
});
