import { describe, it, expect } from "vitest";
import { extractNodeDependencySchema } from "./extract-node-dependency-schema";
import { NodeKind } from "../workflow.interface";
import type { WorkflowNodeData } from "../workflow.interface";
import type { ObjectJsonSchema7 } from "app-types/util";

const makeInputNode = (id: string, extra: Partial<WorkflowNodeData> = {}): WorkflowNodeData =>
  ({
    id,
    name: id,
    kind: NodeKind.Input,
    outputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        count: { type: "number" },
      },
    } as ObjectJsonSchema7,
    ...extra,
  }) as unknown as WorkflowNodeData;

const makeOutputNode = (
  id: string,
  outputData: { key: string; source?: { nodeId: string; path: string[] } }[],
): WorkflowNodeData =>
  ({
    id,
    name: id,
    kind: NodeKind.Output,
    outputData,
    outputSchema: { type: "object", properties: {} } as ObjectJsonSchema7,
  }) as unknown as WorkflowNodeData;

const makeLLMNode = (id: string, schema: ObjectJsonSchema7): WorkflowNodeData =>
  ({
    id,
    name: id,
    kind: NodeKind.LLM,
    outputSchema: schema,
  }) as unknown as WorkflowNodeData;

describe("extractNodeDependencySchema", () => {
  describe("unknown targetId", () => {
    it("returns default empty object schema when target not found", () => {
      const result = extractNodeDependencySchema({
        targetId: "nonexistent",
        nodes: [makeInputNode("n1")],
      });
      expect(result.type).toBe("object");
      expect(result.properties).toEqual({});
    });
  });

  describe("Input node target", () => {
    it("returns the input node's outputSchema directly", () => {
      const node = makeInputNode("input-1");
      const result = extractNodeDependencySchema({
        targetId: "input-1",
        nodes: [node],
      });
      expect(result).toEqual(node.outputSchema);
    });

    it("preserves all properties from the input node's schema", () => {
      const node = makeInputNode("input-2");
      const result = extractNodeDependencySchema({
        targetId: "input-2",
        nodes: [node],
      });
      expect(result.properties?.message).toEqual({ type: "string" });
      expect(result.properties?.count).toEqual({ type: "number" });
    });
  });

  describe("Output node target", () => {
    it("returns empty properties when outputData is empty", () => {
      const outputNode = makeOutputNode("out-1", []);
      const result = extractNodeDependencySchema({
        targetId: "out-1",
        nodes: [outputNode],
      });
      expect(result.type).toBe("object");
      expect(result.properties).toEqual({});
    });

    it("skips outputData entries with no key", () => {
      const outputNode = makeOutputNode("out-2", [
        { key: "", source: { nodeId: "src-1", path: ["value"] } },
      ]);
      const result = extractNodeDependencySchema({
        targetId: "out-2",
        nodes: [outputNode],
      });
      expect(result.properties).toEqual({});
    });

    it("uses string default type when source is absent", () => {
      const outputNode = makeOutputNode("out-3", [{ key: "myField" }]);
      const result = extractNodeDependencySchema({
        targetId: "out-3",
        nodes: [outputNode],
      });
      expect(result.properties?.myField).toEqual({ type: "string" });
    });

    it("uses string default when source node not found", () => {
      const outputNode = makeOutputNode("out-4", [
        { key: "field", source: { nodeId: "missing-node", path: ["x"] } },
      ]);
      const result = extractNodeDependencySchema({
        targetId: "out-4",
        nodes: [outputNode],
      });
      expect(result.properties?.field).toEqual({ type: "string" });
    });

    it("resolves schema from source node via path", () => {
      const sourceNode = makeLLMNode("llm-1", {
        type: "object",
        properties: {
          response: { type: "string" },
        },
      } as ObjectJsonSchema7);
      const outputNode = makeOutputNode("out-5", [
        { key: "result", source: { nodeId: "llm-1", path: ["response"] } },
      ]);
      const result = extractNodeDependencySchema({
        targetId: "out-5",
        nodes: [sourceNode, outputNode],
      });
      expect(result.properties?.result).toEqual({ type: "string" });
    });

    it("maps multiple output data entries independently", () => {
      const sourceNode = makeLLMNode("llm-2", {
        type: "object",
        properties: {
          title: { type: "string" },
          score: { type: "number" },
        },
      } as ObjectJsonSchema7);
      const outputNode = makeOutputNode("out-6", [
        { key: "t", source: { nodeId: "llm-2", path: ["title"] } },
        { key: "s", source: { nodeId: "llm-2", path: ["score"] } },
      ]);
      const result = extractNodeDependencySchema({
        targetId: "out-6",
        nodes: [sourceNode, outputNode],
      });
      expect(result.properties?.t).toEqual({ type: "string" });
      expect(result.properties?.s).toEqual({ type: "number" });
    });
  });

  describe("non-input, non-output node targets", () => {
    it("returns default empty object schema for LLM node", () => {
      const llmNode = makeLLMNode("llm-3", {
        type: "object",
        properties: { x: { type: "string" } },
      } as ObjectJsonSchema7);
      const result = extractNodeDependencySchema({
        targetId: "llm-3",
        nodes: [llmNode],
      });
      expect(result.type).toBe("object");
      expect(result.properties).toEqual({});
    });
  });

  describe("empty nodes list", () => {
    it("returns default schema when nodes array is empty", () => {
      const result = extractNodeDependencySchema({
        targetId: "any",
        nodes: [],
      });
      expect(result.type).toBe("object");
    });
  });
});
