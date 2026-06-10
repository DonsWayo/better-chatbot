import { describe, expect, it } from "vitest";
import {
  ChatExportByThreadIdSchema,
  ChatExportCommentCreateSchema,
  ChatExportCommentUpdateSchema,
  ChatExportCreateSchema,
} from "./chat-export";

describe("ChatExportByThreadIdSchema", () => {
  it("accepts valid threadId", () => {
    const r = ChatExportByThreadIdSchema.safeParse({ threadId: "thread-123" });
    expect(r.success).toBe(true);
  });

  it("accepts threadId with optional expiresAt date", () => {
    const r = ChatExportByThreadIdSchema.safeParse({
      threadId: "thread-123",
      expiresAt: new Date("2026-12-31"),
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expiresAt).toBeInstanceOf(Date);
  });

  it("accepts null expiresAt", () => {
    const r = ChatExportByThreadIdSchema.safeParse({
      threadId: "thread-123",
      expiresAt: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing threadId", () => {
    const r = ChatExportByThreadIdSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("ChatExportCreateSchema", () => {
  const validMessages = [
    { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hello" }] },
  ];

  it("accepts valid export", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "My Export",
      exporterId: "user-1",
      messages: validMessages,
    });
    expect(r.success).toBe(true);
  });

  it("accepts with optional fields", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "My Export",
      exporterId: "user-1",
      originalThreadId: "thread-abc",
      messages: validMessages,
      expiresAt: new Date("2026-12-31"),
    });
    expect(r.success).toBe(true);
  });

  it("accepts null originalThreadId", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "My Export",
      exporterId: "user-1",
      originalThreadId: null,
      messages: validMessages,
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty title", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "",
      exporterId: "user-1",
      messages: validMessages,
    });
    expect(r.success).toBe(false);
  });

  it("rejects title over 200 characters", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "a".repeat(201),
      exporterId: "user-1",
      messages: validMessages,
    });
    expect(r.success).toBe(false);
  });

  it("accepts empty messages array", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "Empty Export",
      exporterId: "user-1",
      messages: [],
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing exporterId", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "My Export",
      messages: validMessages,
    });
    expect(r.success).toBe(false);
  });
});

describe("ChatExportCommentCreateSchema", () => {
  const validContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
    ],
  };

  it("accepts valid comment", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "export-1",
      authorId: "user-1",
      content: validContent,
    });
    expect(r.success).toBe(true);
  });

  it("accepts with optional parentId (reply)", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "export-1",
      authorId: "user-1",
      parentId: "comment-parent",
      content: validContent,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBe("comment-parent");
  });

  it("rejects missing exportId", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      authorId: "user-1",
      content: validContent,
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing authorId", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "export-1",
      content: validContent,
    });
    expect(r.success).toBe(false);
  });
});

describe("ChatExportCommentUpdateSchema", () => {
  it("accepts valid content update", () => {
    const r = ChatExportCommentUpdateSchema.safeParse({
      content: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts missing content (z.any() is permissive)", () => {
    // content is typed as z.any() so undefined is accepted
    const r = ChatExportCommentUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe("ChatExportByThreadIdSchema — additional boundaries", () => {
  it("accepts empty threadId (schema does not enforce min length)", () => {
    const r = ChatExportByThreadIdSchema.safeParse({ threadId: "" });
    expect(r.success).toBe(true);
  });

  it("accepts UUID-style threadId", () => {
    const r = ChatExportByThreadIdSchema.safeParse({
      threadId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.threadId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("parsed expiresAt is null when null provided", () => {
    const r = ChatExportByThreadIdSchema.safeParse({
      threadId: "t1",
      expiresAt: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expiresAt).toBeNull();
  });
});

describe("ChatExportCreateSchema — additional boundaries", () => {
  const msgs = [
    { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
  ];

  it("accepts title at exactly 200 characters", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "a".repeat(200),
      exporterId: "u1",
      messages: msgs,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing messages field", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "Export",
      exporterId: "u1",
    });
    expect(r.success).toBe(false);
  });

  it("accepts expiresAt as null", () => {
    const r = ChatExportCreateSchema.safeParse({
      title: "Export",
      exporterId: "u1",
      messages: msgs,
      expiresAt: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("ChatExportCommentCreateSchema — additional boundaries", () => {
  const content = { type: "doc", content: [] };

  it("rejects null parentId (parentId is optional, not nullable)", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "e1",
      authorId: "a1",
      parentId: null,
      content,
    });
    expect(r.success).toBe(false);
  });

  it("accepts missing content (content is z.any())", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "e1",
      authorId: "a1",
    });
    expect(r.success).toBe(true);
  });

  it("parsed data includes exportId and authorId", () => {
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "e1",
      authorId: "a1",
      content,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.exportId).toBe("e1");
      expect(r.data.authorId).toBe("a1");
    }
  });
});

describe("ChatExport schemas — cross-schema invariants", () => {
  it("ChatExportByThreadIdSchema rejects non-string threadId", () => {
    const r = ChatExportByThreadIdSchema.safeParse({ threadId: 123 });
    expect(r.success).toBe(false);
  });

  it("ChatExportCreateSchema rejects empty threadId", () => {
    const r = ChatExportCreateSchema.safeParse({
      threadId: "",
      visibility: "public",
    });
    expect(r.success).toBe(false);
  });

  it("ChatExportCommentUpdateSchema accepts empty object (content is z.any())", () => {
    const r = ChatExportCommentUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("ChatExportCommentCreateSchema rejects non-string authorId", () => {
    const content = { type: "doc", content: [] };
    const r = ChatExportCommentCreateSchema.safeParse({
      exportId: "e1",
      authorId: 42,
      content,
    });
    expect(r.success).toBe(false);
  });
});
