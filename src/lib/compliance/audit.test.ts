import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });
  });

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
    await writeAuditLog({
      userId: "u1",
      teamId: "t1",
      eventType: "admin_action",
    });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "t1" }),
    );
  });

  it("never throws even when DB fails", async () => {
    dbInsertValuesMock.mockRejectedValueOnce(new Error("DB down"));
    const { writeAuditLog } = await import("./audit");
    await expect(
      writeAuditLog({ userId: "u1", eventType: "chat_request" }),
    ).resolves.toBeUndefined();
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
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });
  });

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

describe("auditChatRequest — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });
  });

  it("fires with guardrailFired=true and does not throw", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { auditChatRequest } = await import("./audit");
    expect(() =>
      auditChatRequest({
        userId: "u1",
        model: "gpt-5.1",
        promptHash: "abc",
        guardrailFired: true,
        ragUsed: false,
      }),
    ).not.toThrow();
  });

  it("fires with ragUsed=false and does not throw", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { auditChatRequest } = await import("./audit");
    expect(() =>
      auditChatRequest({
        userId: "u2",
        model: "claude-opus-4.8",
        promptHash: "xyz",
        guardrailFired: false,
        ragUsed: false,
      }),
    ).not.toThrow();
  });
});

describe("writeAuditLog — no details field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });
  });

  it("inserts without throwing when details is omitted", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await expect(
      writeAuditLog({ userId: "u1", eventType: "aup_accepted" }),
    ).resolves.toBeUndefined();
  });

  it("calls DB exactly once", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({ userId: "u99", eventType: "guardrail_firing" });
    expect(dbInsertValuesMock).toHaveBeenCalledTimes(1);
  });
});

describe("hashContent — additional", () => {
  it("returns a non-empty string", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("input").length).toBeGreaterThan(0);
  });

  it("hash is deterministic across multiple calls", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("deterministic")).toBe(hashContent("deterministic"));
  });

  it("hash changes when a single character is added", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("hello")).not.toBe(hashContent("hello!"));
  });

  it("long input produces same length hash as short input", async () => {
    const { hashContent } = await import("./audit");
    const short = hashContent("ab");
    const long = hashContent("a".repeat(1000));
    expect(short.length).toBe(long.length);
  });
});

describe("writeAuditLog — actor attribution (B90 #23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });
  });

  it("defaults to actorType 'human' and agentSessionId null", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({ userId: "u1", eventType: "admin_action" });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "human", agentSessionId: null }),
    );
  });

  it("persists explicit agent attribution", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({
      userId: "u1",
      eventType: "tool_call",
      actorType: "agent",
      agentSessionId: "session-42",
    });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "agent",
        agentSessionId: "session-42",
      }),
    );
  });

  it("keeps agentSessionId null when only actorType 'agent' is provided", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({
      userId: "u1",
      eventType: "tool_call",
      actorType: "agent",
    });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "agent", agentSessionId: null }),
    );
  });

  it("passes through explicit 'human' actorType unchanged", async () => {
    dbInsertValuesMock.mockResolvedValueOnce([]);
    const { writeAuditLog } = await import("./audit");
    await writeAuditLog({
      userId: "u1",
      eventType: "chat_request",
      actorType: "human",
    });
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "human" }),
    );
  });
});

describe("hashContent and auditChatRequest — type invariants", () => {
  it("hashContent returns a string", async () => {
    const { hashContent } = await import("./audit");
    expect(typeof hashContent("any input")).toBe("string");
  });

  it("hashContent returns a non-empty string", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("input").length).toBeGreaterThan(0);
  });

  it("hashContent is deterministic for same input", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("same")).toBe(hashContent("same"));
  });

  it("hashContent differs for different inputs", async () => {
    const { hashContent } = await import("./audit");
    expect(hashContent("abc")).not.toBe(hashContent("def"));
  });
});
