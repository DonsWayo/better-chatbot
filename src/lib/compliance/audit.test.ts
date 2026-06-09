import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbInsertMock } = vi.hoisted(() => ({
  dbInsertMock: vi.fn(),
}));

const dbInsertValuesMock = vi.fn().mockResolvedValue([]);
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: { insert: dbInsertMock },
}));
vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeAuditLogTable: {},
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      error: vi.fn(),
    }),
  },
}));

describe("writeAuditLog", () => {
  beforeEach(() => { vi.clearAllMocks(); dbInsertMock.mockReturnValue({ values: dbInsertValuesMock }); });

  it("inserts audit record with all fields", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({ userId: "u1", eventType: "aup_accepted" });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", eventType: "aup_accepted" }),
    );
  });

  it("includes teamId when provided", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({ userId: "u1", teamId: "t1", eventType: "admin_action" });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "t1" }),
    );
  });

  it("never throws even when DB fails", async () => {
    dbInsertValuesMock.mockRejectedValueOnce(new Error("DB down"));
    const { writeAuditLog } = await import("./audit");
    await expect(writeAuditLog({ userId: "u1", eventType: "chat_request" })).resolves.toBeUndefined();
  });
});

describe("hashContent", () => {
  it("returns a hex string", async () => {
    const { hashContent } = await import("./audit");
    const h = hashContent("hello world");
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("returns consistent output for same input", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("abc")).toBe(hashContent("abc"));
  });

  it("returns different hashes for different inputs", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("abc")).not.toBe(hashContent("xyz"));
  });

  it("handles empty string without throwing", async () => {
    const { hashContent } = await import("./audit");
    expect(() => hashContent("")).not.toThrow();
  });
});

describe("auditChatRequest", () => {
  it("fires and does not throw", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { auditChatRequest } = await import("./audit");
    expect(() =>
      auditChatRequest({
        userId: "u1",
        model: "openai/gpt-4o",
        promptHash: "abc123",
        guardrailFired: false,
        ragUsed: true,
      }),
    ).not.toThrow();
  });
});
