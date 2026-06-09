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

describe("writeAuditLog — details field", () => {
  beforeEach(() => { vi.clearAllMocks(); dbInsertMock.mockReturnValue({ values: dbInsertValuesMock }); });

  it("serializes details as JSON string before inserting", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    const details = { model: "gpt-5.1", tokens: 1234 };
    await writeAuditLog({ userId: "u1", eventType: "chat_request", details });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ details: JSON.stringify(details) }),
    );
  });

  it("calls db.insert exactly once per call", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({ userId: "u1", eventType: "guardrail_firing" });
    expect(dbInsertValuesMock).toHaveBeenCalledTimes(1);
  });
});

describe("hashContent — length and format", () => {
  it("returns only hex characters", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("hello world 123")).toMatch(/^[0-9a-f]+$/);
  });

  it("hash is at most 8 characters long", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("test input").length).toBeLessThanOrEqual(8);
  });

  it("hash of empty string returns a hex string", async () => {
    const { hashContent } = await import("./audit");
    const h = hashContent("");
    expect(h).toMatch(/^[0-9a-f]+$/);
  });
});
