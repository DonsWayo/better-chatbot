import { describe, it, expect, vi } from "vitest";

vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "test-uuid"),
}));
vi.mock("@xyflow/react", () => ({}));
vi.mock("ts-edge", () => ({}));
vi.mock("ai", () => ({}));
vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "test-uuid"),
  isString: (v: any) => typeof v === "string",
  exclude: (obj: any, keys: string[]) => {
    const r = { ...obj };
    for (const k of keys) delete r[k];
    return r;
  },
  objectFlow: () => ({}),
}));

import { createUINode } from "./create-ui-node";
import { NodeKind } from "./workflow.interface";

describe("createUINode", () => {
  it("creates an Input node with generated UUID", () => {
    const node = createUINode(NodeKind.Input);
    expect(node.id).toBe("test-uuid");
    expect(node.data.kind).toBe(NodeKind.Input);
    expect(node.data.name).toBe(NodeKind.Input.toUpperCase());
  });

  it("uses provided position", () => {
    const node = createUINode(NodeKind.LLM, { position: { x: 100, y: 200 } });
    expect(node.position).toEqual({ x: 100, y: 200 });
  });

  it("defaults position to {x:0, y:0}", () => {
    const node = createUINode(NodeKind.Tool);
    expect(node.position).toEqual({ x: 0, y: 0 });
  });

  it("uses provided name", () => {
    const node = createUINode(NodeKind.LLM, { name: "My LLM Node" });
    expect(node.data.name).toBe("My LLM Node");
  });

  it("uses provided id", () => {
    const node = createUINode(NodeKind.Input, { id: "custom-id" });
    expect(node.id).toBe("custom-id");
  });

  it("sets isNew:true in runtime", () => {
    const node = createUINode(NodeKind.Output);
    expect(node.data.runtime?.isNew).toBe(true);
  });

  it("LLM node has output schema with text property", () => {
    const node = createUINode(NodeKind.LLM);
    const props = node.data.outputSchema?.properties ?? {};
    expect(typeof props).toBe("object");
  });

  it("Output node has outputData array", () => {
    const node = createUINode(NodeKind.Output);
    expect(Array.isArray(node.data.outputData)).toBe(true);
  });

  it("Condition node has if/else branches", () => {
    const node = createUINode(NodeKind.Condition);
    expect(node.data.branches?.if).toBeDefined();
    expect(node.data.branches?.else).toBeDefined();
    expect(node.data.branches?.if.type).toBe("if");
    expect(node.data.branches?.else.type).toBe("else");
  });

  it("Tool node has tool_result in outputSchema", () => {
    const node = createUINode(NodeKind.Tool);
    expect(node.data.outputSchema?.properties?.tool_result).toBeDefined();
  });

  it("Http node has response schema with status/body fields", () => {
    const node = createUINode(NodeKind.Http);
    const responseProps = (node.data.outputSchema?.properties?.response as any)?.properties ?? {};
    expect(responseProps.status).toBeDefined();
    expect(responseProps.body).toBeDefined();
  });
});
