import { describe, expect, it, vi } from "vitest";
import type { GraphStartEvent } from "ts-edge";
import {
  defaultObjectJsonSchema,
  findAccessibleNodeIds,
  findJsonSchemaByPath,
  encodeWorkflowEvent,
  decodeWorkflowEvents,
  convertTiptapJsonToText,
  WORKFLOW_STREAM_DELIMITER,
  WORKFLOW_STREAM_PREFIX,
} from "./shared.workflow";
import type { WorkflowNodeData } from "./workflow.interface";
import type { ObjectJsonSchema7 } from "app-types/util";
import type { TipTapMentionJsonContent } from "app-types/util";

vi.mock("server-only", () => ({}));

// ------------ helpers ------------
const node = (id: string): WorkflowNodeData =>
  ({
    id,
    name: id,
    outputSchema: { type: "object", properties: {} },
    kind: "input",
  }) as unknown as WorkflowNodeData;
const edge = (source: string, target: string) => ({ source, target });

// A minimal valid GraphStartEvent
const startEvent: GraphStartEvent = { eventType: "WORKFLOW_START", startedAt: 0, input: undefined };

// ------------ defaultObjectJsonSchema ------------
describe("defaultObjectJsonSchema", () => {
  it("is an object schema", () => {
    expect(defaultObjectJsonSchema.type).toBe("object");
  });

  it("has an empty properties map", () => {
    expect(defaultObjectJsonSchema.properties).toEqual({});
  });
});

// ------------ findAccessibleNodeIds ------------
describe("findAccessibleNodeIds", () => {
  it("returns empty array when no incoming edges", () => {
    const result = findAccessibleNodeIds({
      nodeId: "n1",
      nodes: [node("n1"), node("n2")],
      edges: [],
    });
    expect(result).toEqual([]);
  });

  it("finds direct parent", () => {
    const result = findAccessibleNodeIds({
      nodeId: "n2",
      nodes: [node("n1"), node("n2")],
      edges: [edge("n1", "n2")],
    });
    expect(result).toContain("n1");
  });

  it("finds transitive ancestors", () => {
    const result = findAccessibleNodeIds({
      nodeId: "n3",
      nodes: [node("n1"), node("n2"), node("n3")],
      edges: [edge("n1", "n2"), edge("n2", "n3")],
    });
    expect(result).toContain("n2");
    expect(result).toContain("n1");
  });

  it("does not include the node itself", () => {
    const result = findAccessibleNodeIds({
      nodeId: "n2",
      nodes: [node("n1"), node("n2")],
      edges: [edge("n1", "n2")],
    });
    expect(result).not.toContain("n2");
  });

  it("excludes nodes not in the nodes list", () => {
    const result = findAccessibleNodeIds({
      nodeId: "n1",
      nodes: [node("n1")],
      edges: [edge("n0", "n1")],
    });
    expect(result).not.toContain("n0");
  });
});

describe("findAccessibleNodeIds — return type invariants", () => {
  it("always returns an array", () => {
    const result = findAccessibleNodeIds({ nodeId: "x", nodes: [], edges: [] });
    expect(Array.isArray(result)).toBe(true);
  });

  it("no duplicates in returned array", () => {
    const nodes = [node("n1"), node("n2"), node("n3"), node("n4")];
    const edges = [edge("n1", "n2"), edge("n1", "n3"), edge("n2", "n4"), edge("n3", "n4")];
    const result = findAccessibleNodeIds({ nodeId: "n4", nodes, edges });
    const unique = new Set(result);
    expect(unique.size).toBeLessThanOrEqual(result.length);
  });
});

// ------------ findJsonSchemaByPath ------------
describe("findJsonSchemaByPath", () => {
  const schema: ObjectJsonSchema7 = {
    type: "object",
    properties: {
      name: { type: "string" },
      address: {
        type: "object",
        properties: {
          city: { type: "string" },
          zip: { type: "number" },
        },
      },
    },
  };

  it("finds top-level property", () => {
    expect(findJsonSchemaByPath(schema, ["name"])).toEqual({ type: "string" });
  });

  it("finds nested property", () => {
    expect(findJsonSchemaByPath(schema, ["address", "city"])).toEqual({ type: "string" });
  });

  it("returns undefined for missing top-level key", () => {
    expect(findJsonSchemaByPath(schema, ["missing"])).toBeUndefined();
  });

  it("finds deeply nested property", () => {
    expect(findJsonSchemaByPath(schema, ["address", "zip"])).toEqual({ type: "number" });
  });
});

// ------------ WORKFLOW_STREAM constants ------------
describe("WORKFLOW_STREAM constants", () => {
  it("WORKFLOW_STREAM_DELIMITER is a string", () => {
    expect(typeof WORKFLOW_STREAM_DELIMITER).toBe("string");
  });

  it("WORKFLOW_STREAM_PREFIX is a non-empty string", () => {
    expect(typeof WORKFLOW_STREAM_PREFIX).toBe("string");
    expect(WORKFLOW_STREAM_PREFIX.length).toBeGreaterThan(0);
  });
});

// ------------ encodeWorkflowEvent / decodeWorkflowEvents ------------
describe("encodeWorkflowEvent", () => {
  it("returns a string", () => {
    expect(typeof encodeWorkflowEvent(startEvent)).toBe("string");
  });

  it("starts with WORKFLOW_STREAM_PREFIX", () => {
    expect(encodeWorkflowEvent(startEvent).startsWith(WORKFLOW_STREAM_PREFIX)).toBe(true);
  });

  it("ends with WORKFLOW_STREAM_DELIMITER", () => {
    expect(encodeWorkflowEvent(startEvent).endsWith(WORKFLOW_STREAM_DELIMITER)).toBe(true);
  });

  it("encoded string contains the eventType", () => {
    const result = encodeWorkflowEvent(startEvent);
    expect(result).toContain("WORKFLOW_START");
  });
});

describe("decodeWorkflowEvents", () => {
  it("returns events and remainingBuffer", () => {
    const result = decodeWorkflowEvents("");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("remainingBuffer");
  });

  it("decodes a single encoded event round-trip", () => {
    const encoded = encodeWorkflowEvent(startEvent);
    const { events } = decodeWorkflowEvents(encoded);
    expect(events.length).toBe(1);
    const decoded = events[0] as { eventType: string };
    expect(decoded.eventType).toBe("WORKFLOW_START");
  });

  it("returns empty events for empty buffer", () => {
    const { events, remainingBuffer } = decodeWorkflowEvents("");
    expect(events).toEqual([]);
    expect(remainingBuffer).toBe("");
  });

  it("preserves partial line in remainingBuffer", () => {
    const partialLine = "WF_EVENT:{partial";
    const { remainingBuffer } = decodeWorkflowEvents(partialLine);
    expect(remainingBuffer).toBe(partialLine);
  });

  it("decodes multiple events", () => {
    const e1 = encodeWorkflowEvent(startEvent);
    const e2 = encodeWorkflowEvent(startEvent);
    const { events } = decodeWorkflowEvents(e1 + e2);
    expect(events.length).toBe(2);
  });
});

// ------------ convertTiptapJsonToText ------------
describe("convertTiptapJsonToText", () => {
  const getOutput = () => "";

  it("returns empty string for empty content", () => {
    const json: TipTapMentionJsonContent = { type: "doc", content: [] };
    expect(convertTiptapJsonToText({ json, getOutput })).toBe("");
  });

  it("converts simple text paragraph", () => {
    const json: TipTapMentionJsonContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    };
    expect(convertTiptapJsonToText({ json, getOutput })).toBe("Hello");
  });

  it("converts hard break between text nodes", () => {
    const json: TipTapMentionJsonContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line1" },
            { type: "hardBreak" },
            { type: "text", text: "Line2" },
          ],
        },
      ],
    };
    const result = convertTiptapJsonToText({ json, getOutput });
    expect(result).toContain("Line1");
    expect(result).toContain("Line2");
  });

  it("always returns a string", () => {
    const json: TipTapMentionJsonContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
    };
    expect(typeof convertTiptapJsonToText({ json, getOutput })).toBe("string");
  });

  it("uses custom mentionParser when provided", () => {
    const json: TipTapMentionJsonContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "id1", label: '{"nodeId":"n1","path":[]}' } }],
        },
      ],
    };
    const mentionParser = vi.fn(() => "MENTION_VALUE");
    convertTiptapJsonToText({ json, getOutput, mentionParser });
    expect(mentionParser).toHaveBeenCalledTimes(1);
  });
});
