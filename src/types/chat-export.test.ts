import { describe, it, expect } from "vitest";
import {
  ChatExportByThreadIdSchema,
  ChatExportCreateSchema,
  ChatExportCommentCreateSchema,
  ChatExportCommentUpdateSchema,
} from "./chat-export";

describe("ChatExportByThreadIdSchema", () => {
  it("accepts a valid threadId", () => {
    expect(() =>
      ChatExportByThreadIdSchema.parse({ threadId: "thread-abc" }),
    ).not.toThrow();
  });

  it("accepts threadId with optional expiresAt", () => {
    const result = ChatExportByThreadIdSchema.parse({
      threadId: "t1",
      expiresAt: new Date("2026-12-31"),
    });
    expect(result.threadId).toBe("t1");
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("accepts null expiresAt", () => {
    expect(() =>
      ChatExportByThreadIdSchema.parse({ threadId: "t1", expiresAt: null }),
    ).not.toThrow();
  });

  it("rejects missing threadId", () => {
    expect(() => ChatExportByThreadIdSchema.parse({})).toThrow();
  });
});

describe("ChatExportCreateSchema", () => {
  const validMessages = [
    { id: "msg-1", role: "user", parts: [], metadata: undefined },
  ];

  it("accepts a minimal valid export", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "My Chat Export",
        exporterId: "user-123",
        messages: validMessages,
      }),
    ).not.toThrow();
  });

  it("accepts full export with all optional fields", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "Full Export",
        exporterId: "user-123",
        originalThreadId: "thread-456",
        messages: validMessages,
        expiresAt: new Date("2027-01-01"),
      }),
    ).not.toThrow();
  });

  it("accepts title of exactly 1 character", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "A",
        exporterId: "u",
        messages: [],
      }),
    ).not.toThrow();
  });

  it("accepts title of exactly 200 characters", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "A".repeat(200),
        exporterId: "u",
        messages: [],
      }),
    ).not.toThrow();
  });

  it("rejects empty title", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "",
        exporterId: "u",
        messages: [],
      }),
    ).toThrow();
  });

  it("rejects title longer than 200 characters", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "A".repeat(201),
        exporterId: "u",
        messages: [],
      }),
    ).toThrow();
  });

  it("accepts null originalThreadId", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "T",
        exporterId: "u",
        originalThreadId: null,
        messages: [],
      }),
    ).not.toThrow();
  });

  it("accepts null expiresAt", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "T",
        exporterId: "u",
        messages: [],
        expiresAt: null,
      }),
    ).not.toThrow();
  });

  it("rejects missing exporterId", () => {
    expect(() =>
      ChatExportCreateSchema.parse({ title: "T", messages: [] }),
    ).toThrow();
  });

  it("rejects missing messages field", () => {
    expect(() =>
      ChatExportCreateSchema.parse({ title: "T", exporterId: "u" }),
    ).toThrow();
  });

  it("message objects require id and role and parts", () => {
    expect(() =>
      ChatExportCreateSchema.parse({
        title: "T",
        exporterId: "u",
        messages: [{ id: "m1", role: "user", parts: [] }],
      }),
    ).not.toThrow();
  });
});

describe("ChatExportCommentCreateSchema", () => {
  it("accepts minimal comment", () => {
    expect(() =>
      ChatExportCommentCreateSchema.parse({
        exportId: "exp-1",
        authorId: "user-1",
        content: { type: "doc", content: [] },
      }),
    ).not.toThrow();
  });

  it("accepts comment with parentId", () => {
    expect(() =>
      ChatExportCommentCreateSchema.parse({
        exportId: "exp-1",
        authorId: "user-1",
        parentId: "parent-comment-1",
        content: { type: "doc", content: [] },
      }),
    ).not.toThrow();
  });

  it("rejects missing exportId", () => {
    expect(() =>
      ChatExportCommentCreateSchema.parse({
        authorId: "user-1",
        content: {},
      }),
    ).toThrow();
  });

  it("rejects missing authorId", () => {
    expect(() =>
      ChatExportCommentCreateSchema.parse({
        exportId: "exp-1",
        content: {},
      }),
    ).toThrow();
  });
});

describe("ChatExportCommentUpdateSchema", () => {
  it("accepts valid content update", () => {
    expect(() =>
      ChatExportCommentUpdateSchema.parse({
        content: { type: "doc", content: [] },
      }),
    ).not.toThrow();
  });

  it("accepts any content structure", () => {
    expect(() =>
      ChatExportCommentUpdateSchema.parse({
        content: { arbitrary: "data", nested: { value: 123 } },
      }),
    ).not.toThrow();
  });

  it("accepts missing content (z.any allows undefined)", () => {
    expect(() => ChatExportCommentUpdateSchema.parse({})).not.toThrow();
  });
});
