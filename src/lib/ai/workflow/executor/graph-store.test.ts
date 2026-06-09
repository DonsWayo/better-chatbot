import { describe, expect, it } from "vitest";
import { createGraphStore } from "./graph-store";
import { DBNode } from "app-types/workflow";

describe("workflow-store", () => {
  it("source", () => {
    const store = createGraphStore({
      nodes: [],
      edges: [],
    });
    const context = store();

    expect(context.outputs).toEqual({});
    expect(
      context.getOutput({
        nodeId: "v1",
        path: [],
      }),
    ).toBe(undefined);
    expect(
      context.getOutput({
        nodeId: "v1",
        path: ["person"],
      }),
    ).toBe(undefined);

    context.setOutput(
      {
        nodeId: "v1",
        path: ["person"],
      },
      {
        name: "cgoing",
        age: 30,
      },
    );
    expect(
      context.getOutput({
        nodeId: "v1",
        path: ["person"],
      }),
    ).toEqual({
      name: "cgoing",
      age: 30,
    });

    expect(
      context.getOutput({
        nodeId: "v1",
        path: ["person", "name"],
      }),
    ).toBe("cgoing");

    expect(
      context.getOutput({
        nodeId: "v1",
        path: ["person", "name", "xxx"],
      }),
    ).toBe(undefined);

    context.setOutput(
      {
        nodeId: "v2",
        path: ["person", "name", "xxx"],
      },
      "xxx",
    );

    expect(
      context.getOutput({
        nodeId: "v2",
        path: ["person", "name", "xxx"],
      }),
    ).toBe("xxx");
  });
  it("default value", () => {
    const store = createGraphStore({
      nodes: [
        {
          id: "v1",
          nodeConfig: {
            outputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  default: "cgoing",
                },
              },
            },
          },
        } as unknown as DBNode,
      ],
      edges: [],
    });
    const context = store();
    expect(
      context.getOutput({
        nodeId: "v1",
        path: ["name"],
      }),
    ).toBe("cgoing");
  });

  it("setOutput overwrites a previously set value", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setOutput({ nodeId: "n1", path: ["score"] }, 10);
    ctx.setOutput({ nodeId: "n1", path: ["score"] }, 99);
    expect(ctx.getOutput({ nodeId: "n1", path: ["score"] })).toBe(99);
  });

  it("setInput / getInput basic roundtrip", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setInput("nodeA", { value: "hello" });
    expect(ctx.getInput("nodeA")).toEqual({ value: "hello" });
  });

  it("multiple nodes have independent outputs", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setOutput({ nodeId: "n1", path: ["x"] }, "alpha");
    ctx.setOutput({ nodeId: "n2", path: ["x"] }, "beta");
    expect(ctx.getOutput({ nodeId: "n1", path: ["x"] })).toBe("alpha");
    expect(ctx.getOutput({ nodeId: "n2", path: ["x"] })).toBe("beta");
  });

  it("getInput for unset node returns undefined", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    expect(ctx.getInput("does-not-exist")).toBeUndefined();
  });

  it("nodes list is accessible from context", () => {
    const node = { id: "n1" } as unknown as DBNode;
    const store = createGraphStore({ nodes: [node], edges: [] });
    const ctx = store();
    expect(ctx.nodes).toHaveLength(1);
    expect(ctx.nodes[0].id).toBe("n1");
  });
});

describe("createGraphStore — input/output invariants", () => {
  it("setInput and getInput round-trip a value", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setInput("node-a", { x: 1 });
    expect(ctx.getInput("node-a")).toEqual({ x: 1 });
  });

  it("getInput returns undefined for unknown node", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    expect(ctx.getInput("no-such-node")).toBeUndefined();
  });

  it("setInput overwrites previous value", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setInput("n1", "first");
    ctx.setInput("n1", "second");
    expect(ctx.getInput("n1")).toBe("second");
  });

  it("outputs is empty map initially", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    expect(ctx.outputs).toEqual({});
  });

  it("setOutput stores a primitive at root path", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setOutput({ nodeId: "n1", path: ["score"] }, 42);
    expect(ctx.getOutput({ nodeId: "n1", path: ["score"] })).toBe(42);
  });

  it("setOutput stores nested objects", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setOutput({ nodeId: "n1", path: ["meta"] }, { title: "hello" });
    expect(ctx.getOutput({ nodeId: "n1", path: ["meta", "title"] })).toBe("hello");
  });

  it("getOutput returns undefined for unknown nodeId with empty path", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    expect(ctx.getOutput({ nodeId: "ghost", path: [] })).toBeUndefined();
  });

  it("multiple nodes are isolated from each other", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    ctx.setOutput({ nodeId: "n1", path: ["val"] }, "from-n1");
    ctx.setOutput({ nodeId: "n2", path: ["val"] }, "from-n2");
    expect(ctx.getOutput({ nodeId: "n1", path: ["val"] })).toBe("from-n1");
    expect(ctx.getOutput({ nodeId: "n2", path: ["val"] })).toBe("from-n2");
  });
});

describe("createGraphStore — state shape invariants", () => {
  it("store function returns an object", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    expect(typeof store()).toBe("object");
  });

  it("context exposes nodes and edges from params", () => {
    const node = { id: "n1", nodeConfig: {} } as unknown as DBNode;
    const store = createGraphStore({ nodes: [node], edges: [] });
    const ctx = store();
    expect(ctx.nodes).toHaveLength(1);
    expect(ctx.edges).toHaveLength(0);
  });

  it("query starts as empty object", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    expect(ctx.query).toEqual({});
  });

  it("inputs starts as empty object", () => {
    const store = createGraphStore({ nodes: [], edges: [] });
    const ctx = store();
    expect(ctx.inputs).toEqual({});
  });
});
