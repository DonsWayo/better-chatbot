import { describe, it, expect } from "vitest";
import {
  ChatAttachmentSchema,
  ChatMentionSchema,
  chatApiSchemaRequestBodySchema,
} from "./chat";

describe("ChatAttachmentSchema", () => {
  it("accepts file attachment", () => {
    const r = ChatAttachmentSchema.safeParse({
      type: "file",
      url: "https://files.example.com/doc.pdf",
      mediaType: "application/pdf",
      filename: "doc.pdf",
    });
    expect(r.success).toBe(true);
  });

  it("accepts source-url attachment", () => {
    const r = ChatAttachmentSchema.safeParse({
      type: "source-url",
      url: "https://example.com/page",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown attachment type", () => {
    const r = ChatAttachmentSchema.safeParse({ type: "video", url: "https://v.example.com" });
    expect(r.success).toBe(false);
  });

  it("rejects missing url", () => {
    const r = ChatAttachmentSchema.safeParse({ type: "file" });
    expect(r.success).toBe(false);
  });
});

describe("ChatMentionSchema", () => {
  it("accepts mcpTool mention", () => {
    const r = ChatMentionSchema.safeParse({
      type: "mcpTool",
      name: "search",
      serverId: "srv-1",
    });
    expect(r.success).toBe(true);
  });

  it("accepts defaultTool mention", () => {
    const r = ChatMentionSchema.safeParse({
      type: "defaultTool",
      name: "web_search",
      label: "Web Search",
    });
    expect(r.success).toBe(true);
  });

  it("accepts mcpServer mention", () => {
    const r = ChatMentionSchema.safeParse({
      type: "mcpServer",
      name: "my-server",
      serverId: "srv-abc",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown mention type", () => {
    const r = ChatMentionSchema.safeParse({ type: "unknownType", name: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects mcpTool without serverId", () => {
    const r = ChatMentionSchema.safeParse({ type: "mcpTool", name: "search" });
    expect(r.success).toBe(false);
  });
});

describe("chatApiSchemaRequestBodySchema", () => {
  it("accepts minimal valid body", () => {
    const r = chatApiSchemaRequestBodySchema.safeParse({
      id: "msg-1",
      message: { role: "user", content: "Hello" },
      toolChoice: "auto",
    });
    expect(r.success).toBe(true);
  });

  it("accepts body with chat model", () => {
    const r = chatApiSchemaRequestBodySchema.safeParse({
      id: "msg-1",
      message: {},
      toolChoice: "auto",
      chatModel: { provider: "openrouter", model: "anthropic/claude-3-5-sonnet" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts body with attachments", () => {
    const r = chatApiSchemaRequestBodySchema.safeParse({
      id: "msg-1",
      message: {},
      toolChoice: "manual",
      attachments: [{ type: "file", url: "https://files.example.com/doc.pdf" }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts body with mentions", () => {
    const r = chatApiSchemaRequestBodySchema.safeParse({
      id: "msg-1",
      message: {},
      toolChoice: "none",
      mentions: [{ type: "defaultTool", name: "search", label: "Search" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing id", () => {
    const r = chatApiSchemaRequestBodySchema.safeParse({ message: {} });
    expect(r.success).toBe(false);
  });
});
