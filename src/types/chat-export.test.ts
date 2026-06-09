import { describe, it, expect } from "vitest";
import {
  ChatExportByThreadIdSchema,
  ChatExportCreateSchema,
  ChatExportCommentCreateSchema,
  ChatExportCommentUpdateSchema,
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
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
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
