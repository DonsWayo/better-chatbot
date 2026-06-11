import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    save: vi.fn(),
    saveStructure: vi.fn(),
  },
}));

vi.mock("lib/agent-platform/revisions", () => ({
  createDraftRevision: vi.fn(),
}));

import { createDraftRevision } from "lib/agent-platform/revisions";
import {
  LLMNodeData,
  NodeKind,
  OutputNodeData,
  ToolNodeData,
} from "lib/ai/workflow/workflow.interface";
import { workflowRepository } from "lib/db/repository";
import {
  DEFAULT_WORKFLOW_LLM_MODEL,
  GenerateWorkflowInput,
  GenerateWorkflowResult,
  MAX_GENERATED_EDGES,
  MAX_GENERATED_NODES,
  buildDraftGraph,
  createGenerateWorkflowTool,
  generateWorkflowInputSchema,
} from "./generate-workflow";

const mockSave = vi.mocked(workflowRepository.save);
const mockSaveStructure = vi.mocked(workflowRepository.saveStructure);
const mockCreateDraftRevision = vi.mocked(createDraftRevision);

const USER_ID = "user-123";

const callOptions = { toolCallId: "call-1", messages: [] };

const validInput = (): GenerateWorkflowInput => ({
  name: "weather-brief",
  description: "Summarize the weather for a region",
  nodes: [
    { kind: "input", name: "INPUT", fields: { region: "string" } },
    {
      kind: "llm",
      name: "SUMMARIZE",
      messages: [{ role: "user", text: "Summarize the weather" }],
    },
    {
      kind: "output",
      name: "OUTPUT",
      outputData: [
        { key: "result", source: { nodeName: "SUMMARIZE", path: ["answer"] } },
      ],
    },
  ],
  edges: [
    { source: "INPUT", target: "SUMMARIZE" },
    { source: "SUMMARIZE", target: "OUTPUT" },
  ],
});

const executeTool = (input: GenerateWorkflowInput) => {
  const tool = createGenerateWorkflowTool({ userId: USER_ID });
  return tool.execute!(input, callOptions) as Promise<GenerateWorkflowResult>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSave.mockResolvedValue({
    id: "wf-1",
    name: "weather-brief",
    version: "0.1.0",
    isPublished: false,
    visibility: "private",
    userId: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  mockSaveStructure.mockResolvedValue(undefined);
  mockCreateDraftRevision.mockResolvedValue({
    id: "rev-1",
  } as unknown as Awaited<ReturnType<typeof createDraftRevision>>);
});

describe("generateWorkflowInputSchema", () => {
  it("accepts a valid 3-node graph", () => {
    const result = generateWorkflowInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("rejects unknown node kinds", () => {
    const input = validInput();
    (input.nodes[1] as unknown as { kind: string }).kind = "robot";
    expect(generateWorkflowInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects nodes missing required fields (http without url)", () => {
    const input = validInput();
    input.nodes.splice(1, 0, {
      kind: "http",
      name: "FETCH",
    } as unknown as GenerateWorkflowInput["nodes"][number]);
    expect(generateWorkflowInputSchema.safeParse(input).success).toBe(false);
  });

  it("slugifies human workflow names instead of rejecting them", () => {
    const input = { ...validInput(), name: "Weather brief! (daily)" };
    const result = generateWorkflowInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Weather-brief-daily");
    }
  });

  it("slugify falls back when nothing survives", () => {
    const input = { ...validInput(), name: "!!!" };
    const result = generateWorkflowInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("generated-workflow");
    }
  });

  it("parses nodes that arrive as JSON strings (weak-model tolerance)", () => {
    const input = validInput();
    const stringified = {
      ...input,
      nodes: input.nodes.map((n) => JSON.stringify(n)),
    } as unknown as GenerateWorkflowInput;
    const result = generateWorkflowInputSchema.safeParse(stringified);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[0]).toMatchObject({ kind: "input" });
    }
  });

  it("rejects more than the node cap", () => {
    const input = validInput();
    for (let i = 0; i < MAX_GENERATED_NODES; i++) {
      input.nodes.push({ kind: "condition", name: `COND-${i}` });
    }
    expect(input.nodes.length).toBeGreaterThan(MAX_GENERATED_NODES);
    expect(generateWorkflowInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects more than the edge cap", () => {
    const input = validInput();
    for (let i = 0; i < MAX_GENERATED_EDGES; i++) {
      input.edges.push({ source: "INPUT", target: "SUMMARIZE" });
    }
    expect(generateWorkflowInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("buildDraftGraph guardrails", () => {
  it("rejects duplicate node names", () => {
    const input = validInput();
    input.nodes[1].name = "INPUT";
    input.edges = [{ source: "INPUT", target: "OUTPUT" }];
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.message.includes("Duplicate node name")),
      ).toBe(true);
    }
  });

  it("rejects graphs without an input node", () => {
    const input = validInput();
    input.nodes = input.nodes.filter((n) => n.kind !== "input");
    input.edges = [{ source: "SUMMARIZE", target: "OUTPUT" }];
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.message.includes("exactly one input node")),
      ).toBe(true);
    }
  });

  it("rejects graphs with two input nodes", () => {
    const input = validInput();
    input.nodes.push({ kind: "input", name: "INPUT-2" });
    input.edges.push({ source: "INPUT-2", target: "SUMMARIZE" });
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) => i.message.includes("exactly one input node")),
      ).toBe(true);
    }
  });

  it("rejects graphs without an output node", () => {
    const input = validInput();
    input.nodes = input.nodes.filter((n) => n.kind !== "output");
    input.edges = [{ source: "INPUT", target: "SUMMARIZE" }];
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) =>
          i.message.includes("at least one output node"),
        ),
      ).toBe(true);
    }
  });

  it("rejects edges referencing unknown node names", () => {
    const input = validInput();
    input.edges.push({ source: "GHOST", target: "OUTPUT" });
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) =>
          i.message.includes('unknown source node "GHOST"'),
        ),
      ).toBe(true);
    }
  });

  it("rejects output sources referencing unknown node names", () => {
    const input = validInput();
    const output = input.nodes[2];
    if (output.kind === "output") {
      output.outputData = [
        { key: "result", source: { nodeName: "GHOST", path: ["answer"] } },
      ];
    }
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((i) =>
          i.message.includes('unknown node name "GHOST"'),
        ),
      ).toBe(true);
    }
  });
});

describe("buildDraftGraph default merging", () => {
  it("fills LLM model default and converts message text to tiptap", () => {
    const input = validInput();
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const llm = result.nodes.find((n) => n.data.kind === NodeKind.LLM)!;
      const data = llm.data as LLMNodeData;
      expect(data.model).toEqual(DEFAULT_WORKFLOW_LLM_MODEL);
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].role).toBe("user");
      expect(data.messages[0].content).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Summarize the weather" }],
          },
        ],
      });
      // create-ui-node default LLM output schema preserved
      expect(data.outputSchema.properties).toHaveProperty("answer");
    }
  });

  it("maps input fields onto the input node output schema", () => {
    const result = buildDraftGraph(validInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const inputNode = result.nodes.find(
        (n) => n.data.kind === NodeKind.Input,
      )!;
      expect(inputNode.data.outputSchema.properties).toEqual({
        region: { type: "string" },
      });
    }
  });

  it("merges http config over create-ui-node defaults", () => {
    const input = validInput();
    input.nodes.splice(2, 0, {
      kind: "http",
      name: "FETCH",
      url: "https://example.com/api",
    });
    input.edges = [
      { source: "INPUT", target: "SUMMARIZE" },
      { source: "SUMMARIZE", target: "FETCH" },
      { source: "FETCH", target: "OUTPUT" },
    ];
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const http = result.nodes.find((n) => n.data.kind === NodeKind.Http)!;
      const data = http.data as unknown as {
        url: string;
        method: string;
        headers: unknown[];
        query: unknown[];
        timeout: number;
      };
      expect(data.url).toBe("https://example.com/api");
      expect(data.method).toBe("GET"); // default
      expect(data.headers).toEqual([]); // default
      expect(data.query).toEqual([]); // default
      expect(data.timeout).toBe(30000); // default
    }
  });

  it("fills tool node defaults (app-tool type, default model, tiptap message)", () => {
    const input = validInput();
    input.nodes.splice(2, 0, {
      kind: "tool",
      name: "RUN-TOOL",
      tool: { id: "webSearch", description: "Search the web" },
    });
    input.edges = [
      { source: "INPUT", target: "SUMMARIZE" },
      { source: "SUMMARIZE", target: "RUN-TOOL" },
      { source: "RUN-TOOL", target: "OUTPUT" },
    ];
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const toolNode = result.nodes.find((n) => n.data.kind === NodeKind.Tool)!;
      const data = toolNode.data as ToolNodeData;
      expect(data.tool).toEqual({
        id: "webSearch",
        description: "Search the web",
        type: "app-tool",
      });
      expect(data.model).toEqual(DEFAULT_WORKFLOW_LLM_MODEL);
      expect(data.message?.type).toBe("doc");
    }
  });

  it("resolves output sources from node names to generated node ids", () => {
    const result = buildDraftGraph(validInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const llm = result.nodes.find((n) => n.data.kind === NodeKind.LLM)!;
      const output = result.nodes.find((n) => n.data.kind === NodeKind.Output)!;
      const data = output.data as OutputNodeData;
      expect(data.outputData).toEqual([
        { key: "result", source: { nodeId: llm.id, path: ["answer"] } },
      ]);
    }
  });

  it("supports the full node vocabulary in one graph", () => {
    const input: GenerateWorkflowInput = {
      name: "full-vocab",
      description: "Every supported node kind",
      nodes: [
        { kind: "input", name: "INPUT" },
        { kind: "llm", name: "LLM" },
        { kind: "condition", name: "COND" },
        {
          kind: "tool",
          name: "TOOL",
          tool: { id: "webSearch", description: "search" },
        },
        { kind: "http", name: "HTTP", url: "https://example.com" },
        { kind: "template", name: "TPL", template: "Hello" },
        { kind: "approval", name: "GATE", requestedRole: "admin" },
        { kind: "output", name: "OUTPUT" },
      ],
      edges: [
        { source: "INPUT", target: "LLM" },
        { source: "LLM", target: "COND" },
        { source: "COND", target: "TOOL", sourceHandle: "if" },
        { source: "TOOL", target: "HTTP" },
        { source: "HTTP", target: "TPL" },
        { source: "TPL", target: "GATE" },
        { source: "GATE", target: "OUTPUT" },
      ],
    };
    const result = buildDraftGraph(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nodes).toHaveLength(8);
      expect(result.edges).toHaveLength(7);
      const approval = result.nodes.find(
        (n) => n.data.kind === NodeKind.Approval,
      )!;
      expect((approval.data as { requestedRole?: string }).requestedRole).toBe(
        "admin",
      );
    }
  });
});

describe("generateWorkflow tool execute", () => {
  it("returns structured issues and does not persist when validation fails", async () => {
    const input = validInput();
    // Input node with no outgoing edge fails node-validate
    input.edges = [{ source: "SUMMARIZE", target: "OUTPUT" }];
    const result = await executeTool(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].message).toBeTruthy();
    }
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveStructure).not.toHaveBeenCalled();
    expect(mockCreateDraftRevision).not.toHaveBeenCalled();
  });

  it("persists a private unpublished workflow owned by the session user", async () => {
    await executeTool(validInput());
    expect(mockSave).toHaveBeenCalledWith(
      {
        name: "weather-brief",
        description: "Summarize the weather for a region",
        visibility: "private",
        isPublished: false,
        userId: USER_ID,
      },
      true, // noGenerateInputNode: the graph already contains one
    );
  });

  it("saves the full structure (nodes + edges) under the new workflow id", async () => {
    await executeTool(validInput());
    expect(mockSaveStructure).toHaveBeenCalledTimes(1);
    const arg = mockSaveStructure.mock.calls[0][0];
    expect(arg.workflowId).toBe("wf-1");
    expect(arg.nodes).toHaveLength(3);
    expect(arg.edges).toHaveLength(2);
    expect(arg.nodes?.map((n) => n.kind).sort()).toEqual([
      "input",
      "llm",
      "output",
    ]);
    expect(arg.nodes?.every((n) => n.workflowId === "wf-1")).toBe(true);
    expect(arg.edges?.every((e) => e.workflowId === "wf-1")).toBe(true);
  });

  it("creates a draft revision authored by the session user", async () => {
    await executeTool(validInput());
    expect(mockCreateDraftRevision).toHaveBeenCalledWith({
      kind: "workflow",
      sourceId: "wf-1",
      authorId: USER_ID,
      changelog: "Generated from chat",
    });
  });

  it("returns workflow/revision ids, counts and the builder url", async () => {
    const result = await executeTool(validInput());
    expect(result).toEqual({
      ok: true,
      workflowId: "wf-1",
      revisionId: "rev-1",
      name: "weather-brief",
      nodeCount: 3,
      edgeCount: 2,
      builderUrl: "/workflow/wf-1",
    });
  });

  it("returns a structured failure when persistence throws", async () => {
    mockSave.mockRejectedValueOnce(new Error("db down"));
    const result = await executeTool(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].message).toContain("db down");
    }
    expect(mockCreateDraftRevision).not.toHaveBeenCalled();
  });

  it("does not create a revision when saveStructure throws", async () => {
    mockSaveStructure.mockRejectedValueOnce(new Error("structure failed"));
    const result = await executeTool(validInput());
    expect(result.ok).toBe(false);
    expect(mockCreateDraftRevision).not.toHaveBeenCalled();
  });

  it("reports duplicate names through execute without persisting", async () => {
    const input = validInput();
    input.nodes[1].name = "OUTPUT";
    const result = await executeTool(input);
    expect(result.ok).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
