import { describe, it, expect } from "vitest";
import {
  ChatAttachmentSchema,
  ChatMentionSchema,
  chatApiSchemaRequestBodySchema,
  ManualToolConfirmTag,
} from "./chat";

describe("ChatAttachmentSchema", () => {
  describe("valid inputs", () => {
    it("accepts a file attachment with all fields", () => {
      const input = {
        type: "file",
        url: "https://example.com/file.pdf",
        mediaType: "application/pdf",
        filename: "doc.pdf",
      };
      expect(() => ChatAttachmentSchema.parse(input)).not.toThrow();
    });

    it("accepts a source-url attachment", () => {
      const input = { type: "source-url", url: "https://example.com" };
      expect(() => ChatAttachmentSchema.parse(input)).not.toThrow();
    });

    it("optional fields can be omitted", () => {
      const input = { type: "file", url: "https://x.com/f" };
      const result = ChatAttachmentSchema.parse(input);
      expect(result.mediaType).toBeUndefined();
      expect(result.filename).toBeUndefined();
    });
  });

  describe("invalid inputs", () => {
    it("rejects unknown type", () => {
      expect(() =>
        ChatAttachmentSchema.parse({ type: "unknown", url: "https://x.com" }),
      ).toThrow();
    });

    it("rejects missing url", () => {
      expect(() =>
        ChatAttachmentSchema.parse({ type: "file" }),
      ).toThrow();
    });
  });
});

describe("ChatMentionSchema", () => {
  describe("mcpTool variant", () => {
    it("accepts a valid mcpTool mention", () => {
      const input = {
        type: "mcpTool",
        name: "fetch-url",
        serverId: "server-1",
        description: "Fetches a URL",
        serverName: "http-server",
      };
      expect(() => ChatMentionSchema.parse(input)).not.toThrow();
    });

    it("rejects mcpTool mention without serverId", () => {
      expect(() =>
        ChatMentionSchema.parse({ type: "mcpTool", name: "tool" }),
      ).toThrow();
    });
  });

  describe("defaultTool variant", () => {
    it("accepts a valid defaultTool mention", () => {
      const input = {
        type: "defaultTool",
        name: "search",
        label: "Web Search",
        description: "Searches the web",
      };
      expect(() => ChatMentionSchema.parse(input)).not.toThrow();
    });

    it("rejects defaultTool without label", () => {
      expect(() =>
        ChatMentionSchema.parse({ type: "defaultTool", name: "search" }),
      ).toThrow();
    });
  });

  describe("mcpServer variant", () => {
    it("accepts a valid mcpServer mention", () => {
      const input = {
        type: "mcpServer",
        name: "my-server",
        serverId: "srv-1",
        toolCount: 5,
      };
      expect(() => ChatMentionSchema.parse(input)).not.toThrow();
    });
  });

  describe("workflow variant", () => {
    it("accepts a valid workflow mention", () => {
      const input = {
        type: "workflow",
        name: "My Workflow",
        workflowId: "wf-1",
      };
      expect(() => ChatMentionSchema.parse(input)).not.toThrow();
    });

    it("accepts workflow mention with icon", () => {
      const input = {
        type: "workflow",
        name: "Wf",
        workflowId: "wf-2",
        icon: { type: "emoji", value: "🚀" },
      };
      expect(() => ChatMentionSchema.parse(input)).not.toThrow();
    });
  });

  describe("agent variant", () => {
    it("accepts a valid agent mention", () => {
      const input = {
        type: "agent",
        name: "My Agent",
        agentId: "agent-1",
      };
      expect(() => ChatMentionSchema.parse(input)).not.toThrow();
    });
  });

  describe("invalid inputs", () => {
    it("rejects unknown type", () => {
      expect(() =>
        ChatMentionSchema.parse({ type: "unknown", name: "x" }),
      ).toThrow();
    });

    it("rejects empty object", () => {
      expect(() => ChatMentionSchema.parse({})).toThrow();
    });
  });
});

describe("chatApiSchemaRequestBodySchema", () => {
  const baseMessage = {
    id: "msg-1",
    role: "user" as const,
    content: "Hello",
    parts: [],
    createdAt: new Date(),
  };

  it("accepts a minimal valid body", () => {
    const input = {
      id: "thread-1",
      message: baseMessage,
      toolChoice: "auto",
    };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).not.toThrow();
  });

  it("accepts toolChoice 'none'", () => {
    const input = { id: "t1", message: baseMessage, toolChoice: "none" };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).not.toThrow();
  });

  it("accepts toolChoice 'manual'", () => {
    const input = { id: "t1", message: baseMessage, toolChoice: "manual" };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).not.toThrow();
  });

  it("accepts body with chatModel", () => {
    const input = {
      id: "t1",
      message: baseMessage,
      toolChoice: "auto",
      chatModel: { provider: "anthropic", model: "claude-3" },
    };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).not.toThrow();
  });

  it("accepts body with attachments", () => {
    const input = {
      id: "t1",
      message: baseMessage,
      toolChoice: "auto",
      attachments: [{ type: "file", url: "https://x.com/f.pdf" }],
    };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).not.toThrow();
  });

  it("rejects missing id", () => {
    const input = { message: baseMessage, toolChoice: "auto" };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).toThrow();
  });

  it("rejects invalid toolChoice", () => {
    const input = { id: "t1", message: baseMessage, toolChoice: "invalid" };
    expect(() => chatApiSchemaRequestBodySchema.parse(input)).toThrow();
  });
});

describe("ManualToolConfirmTag", () => {
  it("create produces a tagged object", () => {
    const tagged = ManualToolConfirmTag.create({ confirm: true });
    expect(ManualToolConfirmTag.isMaybe(tagged)).toBe(true);
  });

  it("isMaybe returns false for untagged object", () => {
    expect(ManualToolConfirmTag.isMaybe({ confirm: true })).toBe(false);
  });

  it("unwrap returns data without tag key", () => {
    const tagged = ManualToolConfirmTag.create({ confirm: false });
    const unwrapped = ManualToolConfirmTag.unwrap(tagged);
    expect(unwrapped.confirm).toBe(false);
    expect("__$ref__" in unwrapped).toBe(false);
  });
});
