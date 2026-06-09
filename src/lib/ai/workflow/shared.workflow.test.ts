import { describe, it, expect, vi } from "vitest";

vi.mock("lib/utils", () => ({
  exclude: vi.fn((obj: any, keys: string[]) => {
    const res = { ...obj };
    for (const k of keys) delete res[k];
    return res;
  }),
  isString: vi.fn((v: any) => typeof v === "string"),
}));

vi.mock("@xyflow/react", () => ({}));
vi.mock("ts-edge", () => ({}));
vi.mock("ai", () => ({}));

import {
  findAccessibleNodeIds,
  findJsonSchemaByPath,
  encodeWorkflowEvent,
  decodeWorkflowEvents,
  convertTiptapJsonToText,
  WORKFLOW_STREAM_PREFIX,
  WORKFLOW_STREAM_DELIMITER,
} from "./shared.workflow";

const NODES = [
  { id: "n1", name: "Start", outputSchema: { type: "object", properties: { text: { type: "string" } } } },
  { id: "n2", name: "Middle", outputSchema: { type: "object", properties: {} } },
  { id: "n3", name: "End", outputSchema: { type: "object", properties: {} } },
] as any;

const EDGES = [
  { source: "n1", target: "n2" },
  { source: "n2", target: "n3" },
];

describe("findAccessibleNodeIds", () => {
  it("returns upstream nodes reachable from a given node", () => {
    const accessible = findAccessibleNodeIds({ nodeId: "n3", nodes: NODES, edges: EDGES });
    expect(accessible).toContain("n2");
    expect(accessible).toContain("n1");
  });

  it("returns empty array for a source node with no incoming edges", () => {
    const accessible = findAccessibleNodeIds({ nodeId: "n1", nodes: NODES, edges: EDGES });
    expect(accessible).toHaveLength(0);
  });

  it("returns direct parent for middle node", () => {
    const accessible = findAccessibleNodeIds({ nodeId: "n2", nodes: NODES, edges: EDGES });
    expect(accessible).toContain("n1");
  });
});

describe("findJsonSchemaByPath", () => {
  const schema = {
    type: "object" as const,
    properties: {
      text: { type: "string" },
      nested: {
        type: "object",
        properties: {
          value: { type: "number" },
        },
      },
    },
  };

  it("finds top-level property", () => {
    const result = findJsonSchemaByPath(schema, ["text"]);
    expect(result).toEqual({ type: "string" });
  });

  it("finds nested property", () => {
    const result = findJsonSchemaByPath(schema as any, ["nested", "value"]);
    expect(result).toEqual({ type: "number" });
  });

  it("returns undefined for missing property", () => {
    const result = findJsonSchemaByPath(schema, ["nonexistent"]);
    expect(result).toBeUndefined();
  });
});

describe("encodeWorkflowEvent / decodeWorkflowEvents", () => {
  it("encodes an event to a prefixed JSON string", () => {
    const encoded = encodeWorkflowEvent({ type: "node_start", nodeId: "n1" } as any);
    expect(encoded).toContain(WORKFLOW_STREAM_PREFIX);
    expect(encoded).toContain("node_start");
    expect(encoded.endsWith(WORKFLOW_STREAM_DELIMITER)).toBe(true);
  });

  it("round-trips a single event", () => {
    const event = { type: "node_end", nodeId: "n2", output: { result: 42 } } as any;
    const encoded = encodeWorkflowEvent(event);
    const { events, remainingBuffer } = decodeWorkflowEvents(encoded);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("node_end");
    expect(remainingBuffer).toBe("");
  });

  it("round-trips multiple events", () => {
    const e1 = encodeWorkflowEvent({ type: "start" } as any);
    const e2 = encodeWorkflowEvent({ type: "end" } as any);
    const { events } = decodeWorkflowEvents(e1 + e2);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("start");
    expect(events[1].type).toBe("end");
  });

  it("handles partial buffer — incomplete event is in remainingBuffer", () => {
    const e1 = encodeWorkflowEvent({ type: "done" } as any);
    const partial = e1 + `${WORKFLOW_STREAM_PREFIX}{"incomplete`; // no trailing newline
    const { events, remainingBuffer } = decodeWorkflowEvents(partial);
    expect(events).toHaveLength(1);
    expect(remainingBuffer).toContain("incomplete");
  });
});

describe("convertTiptapJsonToText", () => {
  it("converts simple paragraph with text", () => {
    const json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    } as any;
    const text = convertTiptapJsonToText({ json, getOutput: () => "" });
    expect(text).toBe("Hello world");
  });

  it("resolves mentions using getOutput", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "mention",
              attrs: { label: JSON.stringify({ nodeId: "n1", path: ["text"] }) },
            },
          ],
        },
      ],
    } as any;
    const getOutput = () => "resolved-value";
    const text = convertTiptapJsonToText({ json, getOutput });
    expect(text).toBe("resolved-value");
  });

  it("returns empty string for empty content", () => {
    const json = { type: "doc", content: [] } as any;
    const text = convertTiptapJsonToText({ json, getOutput: () => "" });
    expect(text).toBe("");
  });

  it("handles bullet lists", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item1" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item2" }] }] },
          ],
        },
      ],
    } as any;
    const text = convertTiptapJsonToText({ json, getOutput: () => "" });
    expect(text).toContain("item1");
    expect(text).toContain("item2");
    expect(text).toContain("•");
  });
});
