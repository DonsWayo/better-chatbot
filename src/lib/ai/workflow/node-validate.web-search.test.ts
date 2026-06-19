import { describe, it, expect } from "vitest";
import { webSearchNodeValidate } from "./node-validate";
import { NodeKind } from "./workflow.interface";
import type { WebSearchNodeData } from "./workflow.interface";

function makeNode(overrides: Partial<WebSearchNodeData> = {}): WebSearchNodeData {
  return {
    id: "ws-1",
    kind: NodeKind.WebSearch,
    name: "Web Search",
    description: "",
    outputSchema: { type: "object", properties: {} },
    query: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] },
    numResults: 5,
    type: "auto",
    ...overrides,
  };
}

describe("webSearchNodeValidate", () => {
  it("passes a fully specified node", () => {
    expect(() =>
      webSearchNodeValidate({ node: makeNode(), nodes: [], edges: [] }),
    ).not.toThrow();
  });

  it("throws when query is empty", () => {
    const node = makeNode({ query: { type: "doc", content: [] } });
    expect(() =>
      webSearchNodeValidate({ node, nodes: [], edges: [] }),
    ).toThrow("query");
  });

  it("throws when query content is missing", () => {
    const node = makeNode({ query: { type: "doc" } as never });
    expect(() =>
      webSearchNodeValidate({ node, nodes: [], edges: [] }),
    ).toThrow("query");
  });

  it("passes when numResults is undefined", () => {
    const node = makeNode({ numResults: undefined });
    expect(() =>
      webSearchNodeValidate({ node, nodes: [], edges: [] }),
    ).not.toThrow();
  });

  it("throws when numResults is 0", () => {
    const node = makeNode({ numResults: 0 });
    expect(() =>
      webSearchNodeValidate({ node, nodes: [], edges: [] }),
    ).toThrow("numResults");
  });

  it("throws when numResults is 21", () => {
    const node = makeNode({ numResults: 21 });
    expect(() =>
      webSearchNodeValidate({ node, nodes: [], edges: [] }),
    ).toThrow("numResults");
  });

  it("passes numResults at boundary values 1 and 20", () => {
    expect(() =>
      webSearchNodeValidate({ node: makeNode({ numResults: 1 }), nodes: [], edges: [] }),
    ).not.toThrow();
    expect(() =>
      webSearchNodeValidate({ node: makeNode({ numResults: 20 }), nodes: [], edges: [] }),
    ).not.toThrow();
  });

  it("throws for an invalid type value", () => {
    const node = makeNode({ type: "invalid" as never });
    expect(() =>
      webSearchNodeValidate({ node, nodes: [], edges: [] }),
    ).toThrow("type");
  });

  it("passes all valid type values", () => {
    for (const t of ["auto", "keyword", "neural"] as const) {
      expect(() =>
        webSearchNodeValidate({ node: makeNode({ type: t }), nodes: [], edges: [] }),
      ).not.toThrow();
    }
  });
});
