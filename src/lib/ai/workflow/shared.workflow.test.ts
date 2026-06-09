import { describe, it, expect } from "vitest";
import {
  findJsonSchemaByPath,
  findAccessibleNodeIds,
  convertTiptapJsonToText,
  decodeWorkflowEvents,
  encodeWorkflowEvent,
  WORKFLOW_STREAM_PREFIX,
  WORKFLOW_STREAM_DELIMITER,
} from "./shared.workflow";
import type { ObjectJsonSchema7 } from "app-types/util";

// ── findJsonSchemaByPath ──────────────────────────────────────────────────────

describe("findJsonSchemaByPath", () => {
  const schema: ObjectJsonSchema7 = {
    type: "object",
    properties: {
      answer: { type: "string" },
      data: {
        type: "object",
        properties: {
          count: { type: "number" },
          items: { type: "array" },
        },
      },
    },
  };

  it("finds top-level property", () => {
    const result = findJsonSchemaByPath(schema, ["answer"]);
    expect(result).toEqual({ type: "string" });
  });

  it("finds nested property via path", () => {
    const result = findJsonSchemaByPath(schema, ["data", "count"]);
    expect(result).toEqual({ type: "number" });
  });

  it("returns undefined for missing key", () => {
    const result = findJsonSchemaByPath(schema, ["missing"]);
    expect(result).toBeUndefined();
  });
});

// ── findAccessibleNodeIds ─────────────────────────────────────────────────────

describe("findAccessibleNodeIds", () => {
  const nodes = [
    { id: "A", name: "A", outputSchema: { type: "object", properties: {} } },
    { id: "B", name: "B", outputSchema: { type: "object", properties: {} } },
    { id: "C", name: "C", outputSchema: { type: "object", properties: {} } },
  ] as any[];

  it("returns empty when no edges point to node", () => {
    const result = findAccessibleNodeIds({ nodeId: "A", nodes, edges: [] });
    expect(result).toEqual([]);
  });

  it("returns direct predecessor", () => {
    const edges = [{ source: "A", target: "B" }];
    const result = findAccessibleNodeIds({ nodeId: "B", nodes, edges });
    expect(result).toContain("A");
  });

  it("returns transitive predecessors", () => {
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ];
    const result = findAccessibleNodeIds({ nodeId: "C", nodes, edges });
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("excludes non-existent source nodes", () => {
    const edges = [{ source: "GHOST", target: "A" }];
    const result = findAccessibleNodeIds({ nodeId: "A", nodes, edges });
    expect(result).not.toContain("GHOST");
  });
});

// ── convertTiptapJsonToText ───────────────────────────────────────────────────

const noopGetOutput = () => undefined;

describe("convertTiptapJsonToText", () => {
  it("converts simple paragraph with text", () => {
    const json = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    };
    const result = convertTiptapJsonToText({ json, getOutput: noopGetOutput });
    expect(result).toBe("Hello world");
  });

  it("handles empty paragraph", () => {
    const json = { type: "doc", content: [{ type: "paragraph" }] };
    const result = convertTiptapJsonToText({ json, getOutput: noopGetOutput });
    expect(result).toBe("");
  });

  it("handles hard break", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line 1" },
            { type: "hardBreak" },
            { type: "text", text: "Line 2" },
          ],
        },
      ],
    };
    const result = convertTiptapJsonToText({ json, getOutput: noopGetOutput });
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });

  it("handles mention nodes via default parser", () => {
    const key = JSON.stringify({ nodeId: "n1", path: ["result"] });
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: "n1.result", label: key } },
          ],
        },
      ],
    };
    const getOutput = () => "resolved_value";
    const result = convertTiptapJsonToText({ json, getOutput });
    expect(result).toContain("resolved_value");
  });

  it("handles custom mention parser", () => {
    const key = JSON.stringify({ nodeId: "n1", path: ["result"] });
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: "n1.result", label: key } },
          ],
        },
      ],
    };
    const result = convertTiptapJsonToText({
      json,
      getOutput: noopGetOutput,
      mentionParser: () => "CUSTOM",
    });
    expect(result).toBe("CUSTOM");
  });

  it("handles bullet list", () => {
    const json = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 1" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 2" }] }] },
          ],
        },
      ],
    };
    const result = convertTiptapJsonToText({ json, getOutput: noopGetOutput });
    expect(result).toContain("Item 1");
    expect(result).toContain("Item 2");
    expect(result).toContain("•");
  });

  it("returns empty string for empty content", () => {
    const json = { type: "doc", content: [] };
    const result = convertTiptapJsonToText({ json, getOutput: noopGetOutput });
    expect(result).toBe("");
  });
});

// ── encodeWorkflowEvent / decodeWorkflowEvents ────────────────────────────────

describe("encodeWorkflowEvent / decodeWorkflowEvents", () => {
  it("encodes event with prefix and delimiter", () => {
    const encoded = encodeWorkflowEvent({ type: "test", payload: "data" } as any);
    expect(encoded.startsWith(WORKFLOW_STREAM_PREFIX)).toBe(true);
    expect(encoded.endsWith(WORKFLOW_STREAM_DELIMITER)).toBe(true);
  });

  it("round-trips a single event", () => {
    const event = { type: "node_start", nodeId: "n1" } as any;
    const encoded = encodeWorkflowEvent(event);
    const { events } = decodeWorkflowEvents(encoded);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "node_start", nodeId: "n1" });
  });

  it("round-trips multiple events concatenated", () => {
    const e1 = encodeWorkflowEvent({ type: "start" } as any);
    const e2 = encodeWorkflowEvent({ type: "end" } as any);
    const { events } = decodeWorkflowEvents(e1 + e2);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "start" });
    expect(events[1]).toMatchObject({ type: "end" });
  });

  it("ignores non-prefixed lines", () => {
    const buffer = "some random text\n" + encodeWorkflowEvent({ type: "ok" } as any);
    const { events } = decodeWorkflowEvents(buffer);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "ok" });
  });

  it("returns remaining buffer (incomplete last line)", () => {
    const complete = encodeWorkflowEvent({ type: "done" } as any);
    const partial = "WF_EVENT:{incomplete";
    const { events, remainingBuffer } = decodeWorkflowEvents(complete + partial);
    expect(events).toHaveLength(1);
    expect(remainingBuffer).toBe(partial);
  });

  it("encoded event includes timestamp field", () => {
    const encoded = encodeWorkflowEvent({ type: "test" } as any);
    const json = encoded.slice(WORKFLOW_STREAM_PREFIX.length).trim();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("timestamp");
    expect(typeof parsed.timestamp).toBe("number");
  });
});
