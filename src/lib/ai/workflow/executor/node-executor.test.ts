import { describe, it, expect, vi } from "vitest";

// Mock server-only modules required by node-executor
vi.mock("server-only", () => ({}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { getClient: vi.fn(), getClients: vi.fn() },
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn() },
}));
vi.mock("ai", async () => ({
  ...(await vi.importActual<typeof import("ai")>("ai")),
  generateText: vi.fn(),
  generateObject: vi.fn(),
  convertToModelMessages: vi.fn(() => []),
}));
import {
  inputNodeExecutor,
  outputNodeExecutor,
  templateNodeExecutor,
} from "./node-executor";
import type { WorkflowRuntimeState } from "./graph-store";
import { NodeKind } from "../workflow.interface";
import type {
  InputNodeData,
  OutputNodeData,
  TemplateNodeData,
  OutputSchemaSourceKey,
} from "../workflow.interface";

// Minimal mock for WorkflowRuntimeState
const makeState = (
  query: Record<string, unknown> = {},
  outputs: Record<string, unknown> = {},
): WorkflowRuntimeState => ({
  query,
  edges: [],
  setInput: vi.fn(),
  getOutput: vi.fn(<T>(key: OutputSchemaSourceKey) => {
    if (!key) return undefined;
    const path = [key.nodeId, ...(key.path || [])];
    let val: unknown = outputs;
    for (const segment of path) {
      val = (val as Record<string, unknown>)?.[segment];
    }
    return val as T;
  }),
});

const makeInputNode = (): InputNodeData =>
  ({
    id: "input-1",
    name: "Start",
    kind: NodeKind.Input,
    outputSchema: { type: "object", properties: {} },
  }) as unknown as InputNodeData;

const makeOutputNode = (
  outputData: { key: string; source?: OutputSchemaSourceKey }[],
): OutputNodeData =>
  ({
    id: "output-1",
    name: "End",
    kind: NodeKind.Output,
    outputData,
    outputSchema: { type: "object", properties: {} },
  }) as unknown as OutputNodeData;

const makeTemplateNode = (
  template: { type: "tiptap" | "string"; tiptap?: unknown },
): TemplateNodeData =>
  ({
    id: "tpl-1",
    name: "Template",
    kind: NodeKind.Template,
    template,
    outputSchema: { type: "object", properties: {} },
  }) as unknown as TemplateNodeData;

describe("inputNodeExecutor", () => {
  it("returns state.query as output", () => {
    const query = { message: "hello", count: 3 };
    const state = makeState(query);
    const result = inputNodeExecutor({ node: makeInputNode(), state });
    expect(result).toEqual({ output: query });
  });

  it("returns empty object query as-is", () => {
    const state = makeState({});
    const result = inputNodeExecutor({ node: makeInputNode(), state });
    expect(result).toEqual({ output: {} });
  });

  it("does not call setInput", () => {
    const state = makeState({ x: 1 });
    inputNodeExecutor({ node: makeInputNode(), state });
    expect(state.setInput).not.toHaveBeenCalled();
  });
});

describe("outputNodeExecutor", () => {
  it("returns empty object when outputData is empty", () => {
    const state = makeState({}, { "node-a": { answer: "hi" } });
    const node = makeOutputNode([]);
    const result = outputNodeExecutor({ node, state });
    expect(result).toEqual({ output: {} });
  });

  it("collects output from a single source node", () => {
    const state = makeState({}, {
      "llm-1": { answer: "Paris" },
    });
    const node = makeOutputNode([
      {
        key: "city",
        source: { nodeId: "llm-1", path: ["answer"] },
      },
    ]);
    const result = outputNodeExecutor({ node, state });
    expect((result.output as Record<string, unknown>).city).toBe("Paris");
  });

  it("collects output from multiple source nodes", () => {
    const state = makeState({}, {
      "node-a": { name: "Alice" },
      "node-b": { score: 42 },
    });
    const node = makeOutputNode([
      { key: "user", source: { nodeId: "node-a", path: ["name"] } },
      { key: "result", source: { nodeId: "node-b", path: ["score"] } },
    ]);
    const result = outputNodeExecutor({ node, state });
    const out = result.output as Record<string, unknown>;
    expect(out.user).toBe("Alice");
    expect(out.result).toBe(42);
  });

  it("calls getOutput for each outputData entry", () => {
    const state = makeState({}, {});
    const source: OutputSchemaSourceKey = { nodeId: "n1", path: ["val"] };
    const node = makeOutputNode([{ key: "k1", source }, { key: "k2", source }]);
    outputNodeExecutor({ node, state });
    expect(state.getOutput).toHaveBeenCalledTimes(2);
  });
});

describe("templateNodeExecutor", () => {
  it("returns object with template key", () => {
    const state = makeState({});
    const node = makeTemplateNode({ type: "string" });
    const result = templateNodeExecutor({ node, state });
    expect(result).toHaveProperty("output");
    expect((result.output as Record<string, unknown>)).toHaveProperty("template");
  });

  it("returns empty string template for non-tiptap type", () => {
    const state = makeState({});
    const node = makeTemplateNode({ type: "string" });
    const result = templateNodeExecutor({ node, state });
    expect((result.output as Record<string, unknown>).template).toBe("");
  });
});
