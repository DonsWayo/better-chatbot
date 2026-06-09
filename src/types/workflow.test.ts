import { describe, it, expect, vi } from "vitest";

vi.mock("lib/tag", async () => {
  const actual = await vi.importActual<typeof import("lib/tag")>("lib/tag");
  return actual;
});

import { VercelAIWorkflowToolTag, VercelAIWorkflowToolStreamingResultTag } from "./workflow";
import type { VercelAIWorkflowTool, VercelAIWorkflowToolStreamingResult } from "./workflow";
import { NodeKind } from "lib/ai/workflow/workflow.interface";

const makeTool = (partial: Partial<VercelAIWorkflowTool> = {}): VercelAIWorkflowTool =>
  ({
    _workflowId: "wf-1",
    _toolName: "my_tool",
    _originToolName: "original",
    description: "Does something",
    parameters: {},
    execute: vi.fn(),
    ...partial,
  }) as unknown as VercelAIWorkflowTool;

const makeStreamingResult = (
  partial: Partial<VercelAIWorkflowToolStreamingResult> = {},
): VercelAIWorkflowToolStreamingResult => ({
  toolCallId: "tc-1",
  workflowName: "My Workflow",
  startedAt: 1000,
  endedAt: 2000,
  history: [],
  status: "success",
  ...partial,
});

describe("VercelAIWorkflowToolTag", () => {
  it("creates a tagged workflow tool", () => {
    const tool = makeTool();
    const tagged = VercelAIWorkflowToolTag.create(tool);
    expect(VercelAIWorkflowToolTag.isMaybe(tagged)).toBe(true);
  });

  it("isMaybe returns false for untagged object", () => {
    expect(VercelAIWorkflowToolTag.isMaybe(makeTool())).toBe(false);
  });

  it("isMaybe returns false for null", () => {
    expect(VercelAIWorkflowToolTag.isMaybe(null)).toBe(false);
  });

  it("unwrap returns original data without tag", () => {
    const tool = makeTool({ _workflowId: "wf-99" });
    const tagged = VercelAIWorkflowToolTag.create(tool);
    const unwrapped = VercelAIWorkflowToolTag.unwrap(tagged);
    expect(unwrapped._workflowId).toBe("wf-99");
    expect("__$ref__" in unwrapped).toBe(false);
  });

  it("preserves _workflowId, _toolName, _originToolName", () => {
    const tool = makeTool({
      _workflowId: "wf-abc",
      _toolName: "search_tool",
      _originToolName: "search",
    });
    const tagged = VercelAIWorkflowToolTag.create(tool);
    expect(tagged._workflowId).toBe("wf-abc");
    expect(tagged._toolName).toBe("search_tool");
    expect(tagged._originToolName).toBe("search");
  });
});

describe("VercelAIWorkflowToolStreamingResultTag", () => {
  it("creates a tagged streaming result", () => {
    const result = makeStreamingResult();
    const tagged = VercelAIWorkflowToolStreamingResultTag.create(result);
    expect(VercelAIWorkflowToolStreamingResultTag.isMaybe(tagged)).toBe(true);
  });

  it("isMaybe returns false for untagged object", () => {
    expect(VercelAIWorkflowToolStreamingResultTag.isMaybe(makeStreamingResult())).toBe(false);
  });

  it("isMaybe returns false for workflow-tagged (wrong tag)", () => {
    const tool = makeTool();
    const taggedTool = VercelAIWorkflowToolTag.create(tool);
    expect(VercelAIWorkflowToolStreamingResultTag.isMaybe(taggedTool)).toBe(false);
  });

  it("unwrap returns original data without tag", () => {
    const result = makeStreamingResult({ toolCallId: "tc-99", status: "fail" });
    const tagged = VercelAIWorkflowToolStreamingResultTag.create(result);
    const unwrapped = VercelAIWorkflowToolStreamingResultTag.unwrap(tagged);
    expect(unwrapped.toolCallId).toBe("tc-99");
    expect(unwrapped.status).toBe("fail");
    expect("__$ref__" in unwrapped).toBe(false);
  });

  it("preserves history array", () => {
    const history = [
      {
        name: "node-1",
        startedAt: 100,
        kind: NodeKind.LLM,
        id: "n1",
        status: "success" as const,
      },
    ];
    const result = makeStreamingResult({ history });
    const tagged = VercelAIWorkflowToolStreamingResultTag.create(result);
    expect(tagged.history).toHaveLength(1);
    expect(tagged.history[0].name).toBe("node-1");
  });

  it("preserves optional error field", () => {
    const result = makeStreamingResult({
      status: "fail",
      error: { name: "TimeoutError", message: "Timed out" },
    });
    const tagged = VercelAIWorkflowToolStreamingResultTag.create(result);
    expect(tagged.error?.name).toBe("TimeoutError");
  });
});

describe("cross-tag isolation", () => {
  it("VercelAIWorkflowToolTag does not match streaming result tag", () => {
    const streamResult = makeStreamingResult();
    const taggedStream = VercelAIWorkflowToolStreamingResultTag.create(streamResult);
    expect(VercelAIWorkflowToolTag.isMaybe(taggedStream)).toBe(false);
  });
});

describe("VercelAIWorkflowToolTag — additional invariants", () => {
  it("isMaybe returns false for a plain string", () => {
    expect(VercelAIWorkflowToolTag.isMaybe("not a tool")).toBe(false);
  });

  it("isMaybe returns false for a number", () => {
    expect(VercelAIWorkflowToolTag.isMaybe(42)).toBe(false);
  });

  it("isMaybe returns false for undefined", () => {
    expect(VercelAIWorkflowToolTag.isMaybe(undefined)).toBe(false);
  });

  it("create then isMaybe returns true for different tools", () => {
    for (const id of ["wf-1", "wf-2", "wf-abc"]) {
      const tagged = VercelAIWorkflowToolTag.create(makeTool({ _workflowId: id }));
      expect(VercelAIWorkflowToolTag.isMaybe(tagged)).toBe(true);
    }
  });
});

describe("VercelAIWorkflowToolStreamingResultTag — additional invariants", () => {
  it("isMaybe returns false for undefined", () => {
    expect(VercelAIWorkflowToolStreamingResultTag.isMaybe(undefined)).toBe(false);
  });

  it("isMaybe returns false for plain object without tag", () => {
    expect(VercelAIWorkflowToolStreamingResultTag.isMaybe({ status: "success" })).toBe(false);
  });

  it("preserves startedAt and endedAt timestamps", () => {
    const result = makeStreamingResult({ startedAt: 1234, endedAt: 5678 });
    const tagged = VercelAIWorkflowToolStreamingResultTag.create(result);
    expect(tagged.startedAt).toBe(1234);
    expect(tagged.endedAt).toBe(5678);
  });

  it("preserves workflowName", () => {
    const result = makeStreamingResult({ workflowName: "My Special Workflow" });
    const tagged = VercelAIWorkflowToolStreamingResultTag.create(result);
    expect(tagged.workflowName).toBe("My Special Workflow");
  });
});
