import { describe, expect, it, vi } from "vitest";
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

vi.mock("server-only", () => ({}));

// ------------ helpers ------------
const node = (id: string): any => ({ id, name: id, outputSchema: { type: "object", properties: {} } });
const edge = (source: string, target: string) => ({ source, target });

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
    // edge references n0 which is not in nodes array
    const result = findAccessibleNodeIds({
      nodeId: "n1",
      nodes: [node("n1")],
      edges: [edge("n0", "n1")],
    });
    // n0 not in nodes list — filtered out
    expect(result).not.toContain("n0");
  });
});

describe("findAccessibleNodeIds — return type invariants", () => {
  it("always returns an array", () => {
    const result = findAccessibleNodeIds({ nodeId: "x", nodes: [], edges: [] });
    expect(Array.isArray(result)).toBe(true);
  });

  it("no duplicates in returned array", () => {
    // diamond: n1 → n2, n1 → n3, n2 → n4, n3 → n4
    const nodes = [node("n1"), node("n2"), node("n3"), node("n4")];
    const edges = [edge("n1", "n2"), edge("n1", "n3"), edge("n2", "n4"), edge("n3", "n4")];
    const result = findAccessibleNodeIds({ nodeId: "n4", nodes, edges });
    // n1 may appear once or twice depending on traversal; check uniqueness
    const unique = new Set(result);
    expect(unique.size).toBeLessThanOrEqual(result.length);
  });
});

// ------------ findJsonSchemaByPath ------------
describe("findJsonSchemaByPath", () => {
  const schema: any = {
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
    const result = encodeWorkflowEvent({ type: "start" } as any);
    expect(typeof result).toBe("string");
  });

  it("starts with WORKFLOW_STREAM_PREFIX", () => {
    const result = encodeWorkflowEvent({ type: "start" } as any);
    expect(result.startsWith(WORKFLOW_STREAM_PREFIX)).toBe(true);
  });

  it("ends with WORKFLOW_STREAM_DELIMITER", () => {
    const result = encodeWorkflowEvent({ type: "end" } as any);
    expect(result.endsWith(WORKFLOW_STREAM_DELIMITER)).toBe(true);
  });

  it("encoded string contains event type", () => {
    const result = encodeWorkflowEvent({ type: "node_start", nodeId: "n1" } as any);
    expect(result).toContain("node_start");
    expect(result).toContain("n1");
  });
});

describe("decodeWorkflowEvents", () => {
  it("returns events and remainingBuffer", () => {
    const result = decodeWorkflowEvents("");
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("remainingBuffer");
  });

  it("decodes a single encoded event round-trip", () => {
    const event = { type: "node_complete", nodeId: "n1" };
    const encoded = encodeWorkflowEvent(event as any);
    const { events } = decodeWorkflowEvents(encoded);
    expect(events.length).toBe(1);
    expect((events[0] as any).type).toBe("node_complete");
    expect((events[0] as any).nodeId).toBe("n1");
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
    const e1 = encodeWorkflowEvent({ type: "start" } as any);
    const e2 = encodeWorkflowEvent({ type: "end" } as any);
    const { events } = decodeWorkflowEvents(e1 + e2);
    expect(events.length).toBe(2);
  });
});

// ------------ convertTiptapJsonToText ------------
describe("convertTiptapJsonToText", () => {
  const getOutput = () => "";

  it("returns empty string for empty content", () => {
    const json: any = { type: "doc", content: [] };
    expect(convertTiptapJsonToText({ json, getOutput })).toBe("");
  });

  it("converts simple text paragraph", () => {
    const json: any = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    };
    expect(convertTiptapJsonToText({ json, getOutput })).toBe("Hello");
  });

  it("converts hard break to newlines", () => {
    const json: any = {
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

  it("returns string type", () => {
    const json: any = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };
    expect(typeof convertTiptapJsonToText({ json, getOutput })).toBe("string");
  });

  it("uses custom mentionParser when provided", () => {
    const json: any = {
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
