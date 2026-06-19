import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeKind } from "../workflow.interface";
import type { WebSearchNodeData } from "../workflow.interface";

// Mock the Exa search tool.
const h = vi.hoisted(() => ({
  exaSearchExecuteMock: vi.fn(),
}));

vi.mock("lib/ai/tools/web/web-search", () => ({
  exaSearchToolForWorkflow: { execute: h.exaSearchExecuteMock },
  exaContentsToolForWorkflow: { execute: vi.fn() },
  ExaSearchResponse: {},
}));

// Other heavy deps that the node-executor module imports but this test doesn't exercise.
vi.mock("ai", () => ({ generateText: vi.fn(), generateObject: vi.fn(), convertToModelMessages: vi.fn(), UIMessage: class {} }));
vi.mock("lib/ai/mcp/mcp-manager", () => ({ mcpClientsManager: {} }));
vi.mock("lib/ai/models", () => ({ customModelProvider: { getModel: vi.fn() } }));
vi.mock("lib/ai/routing/route-model", () => ({ routeModel: vi.fn() }));
vi.mock("lib/ai/guardrails/policies", () => ({ resolvePolicy: vi.fn() }));
vi.mock("lib/ai/guardrails/scan", () => ({ scanInput: vi.fn(), scanOutput: vi.fn() }));
vi.mock("lib/ai/budget", () => ({ estimateCostUsd: vi.fn(() => 0), recordUsage: vi.fn() }));
vi.mock("lib/agent-platform/approval-error", () => ({ ApprovalPendingError: class extends Error {} }));
vi.mock("lib/errors", () => ({ AppError: class extends Error {} }));
vi.mock("lib/json-schema-to-zod", () => ({ jsonSchemaToZod: vi.fn() }));

import { webSearchNodeExecutor } from "./node-executor";
import type { WorkflowRuntimeState } from "./graph-store";

function makeState(outputs: Record<string, unknown> = {}): WorkflowRuntimeState {
  return {
    getOutput: (nodeId: string) => outputs[nodeId] ?? null,
  } as unknown as WorkflowRuntimeState;
}

function makeNode(query: string, overrides: Partial<WebSearchNodeData> = {}): WebSearchNodeData {
  return {
    id: "ws-1",
    kind: NodeKind.WebSearch,
    name: "Search",
    description: "",
    outputSchema: { type: "object", properties: {} },
    query: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: query }] }],
    },
    numResults: 3,
    type: "auto",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("webSearchNodeExecutor", () => {
  it("returns empty results when the query resolves to an empty string", async () => {
    const node = makeNode("");
    const result = await webSearchNodeExecutor({ node, state: makeState() });
    expect(result.output.results).toEqual([]);
    expect(result.output.text).toBe("");
    expect(h.exaSearchExecuteMock).not.toHaveBeenCalled();
  });

  it("calls the search tool with the resolved query", async () => {
    h.exaSearchExecuteMock.mockResolvedValue({ results: [] });
    const node = makeNode("best practices AI governance");
    await webSearchNodeExecutor({ node, state: makeState() });
    expect(h.exaSearchExecuteMock).toHaveBeenCalledTimes(1);
    const [args] = h.exaSearchExecuteMock.mock.calls[0] as [{ query: string; numResults: number; type: string }];
    expect(args.query).toBe("best practices AI governance");
    expect(args.numResults).toBe(3);
    expect(args.type).toBe("auto");
  });

  it("defaults numResults to 5 when undefined", async () => {
    h.exaSearchExecuteMock.mockResolvedValue({ results: [] });
    const node = makeNode("hello", { numResults: undefined });
    await webSearchNodeExecutor({ node, state: makeState() });
    const [args] = h.exaSearchExecuteMock.mock.calls[0] as [{ numResults: number }];
    expect(args.numResults).toBe(5);
  });

  it("defaults type to auto when undefined", async () => {
    h.exaSearchExecuteMock.mockResolvedValue({ results: [] });
    const node = makeNode("hello", { type: undefined });
    await webSearchNodeExecutor({ node, state: makeState() });
    const [args] = h.exaSearchExecuteMock.mock.calls[0] as [{ type: string }];
    expect(args.type).toBe("auto");
  });

  it("returns results and concatenated text from the search response", async () => {
    const fakeResults = [
      { title: "Article 1", url: "https://a.com/1", text: "Content 1" },
      { title: "Article 2", url: "https://a.com/2", text: "Content 2" },
    ];
    h.exaSearchExecuteMock.mockResolvedValue({ results: fakeResults });
    const node = makeNode("AI trends 2026");
    const result = await webSearchNodeExecutor({ node, state: makeState() });
    expect(result.output.results).toEqual(fakeResults);
    expect(result.output.text).toContain("Article 1");
    expect(result.output.text).toContain("Content 2");
  });

  it("handles an undefined results field gracefully", async () => {
    h.exaSearchExecuteMock.mockResolvedValue({});
    const node = makeNode("test query");
    const result = await webSearchNodeExecutor({ node, state: makeState() });
    expect(result.output.results).toEqual([]);
    expect(result.output.text).toBe("");
  });

  it("exposes query/numResults/type in the input field for audit", async () => {
    h.exaSearchExecuteMock.mockResolvedValue({ results: [] });
    const node = makeNode("safety audit", { numResults: 10, type: "neural" });
    const result = await webSearchNodeExecutor({ node, state: makeState() });
    expect(result.input).toMatchObject({
      query: "safety audit",
      numResults: 10,
      type: "neural",
    });
  });
});
