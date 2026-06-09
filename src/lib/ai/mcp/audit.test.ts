import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  },
}));

// Must be mocked before logger is imported transitively
vi.mock("logger", () => ({
  default: {
    withDefaults: vi.fn().mockReturnValue({
      error: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/db/pg/schema.pg", () => ({
  AsafeMcpInvocationLogTable: {},
}));

import { auditMcpInvocation } from "./audit";
import { pgDb } from "@/lib/db/pg/db.pg";

const mockPgDb = vi.mocked(pgDb);

describe("auditMcpInvocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish the default happy-path chain after clearAllMocks
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });
  });

  it("resolves without throwing when DB insert succeeds", async () => {
    await expect(
      auditMcpInvocation({
        userId: "user-1",
        toolName: "read_file",
        outcome: "success",
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when DB insert rejects", async () => {
    const valuesMock = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await expect(
      auditMcpInvocation({
        userId: "user-1",
        toolName: "write_file",
        outcome: "error",
      }),
    ).resolves.toBeUndefined();
  });

  it("calls DB insert with an object containing userId, toolName, teamId, and outcome", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await auditMcpInvocation({
      userId: "user-42",
      teamId: "team-7",
      toolName: "list_directory",
      outcome: "success",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-42",
        teamId: "team-7",
        toolName: "list_directory",
        outcome: "success",
      }),
    );
  });

  it("stores outcome='error' when errorMessage / outcome is 'error'", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });

    await auditMcpInvocation({
      userId: "user-99",
      toolName: "execute_code",
      outcome: "error",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "error",
      }),
    );
  });

  it("insert is called exactly once per invocation", async () => {
    await auditMcpInvocation({
      userId: "u-1",
      toolName: "search",
      outcome: "success",
    });
    expect(mockPgDb.insert).toHaveBeenCalledTimes(1);
  });

  it("teamId is stored as null when not provided", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });
    await auditMcpInvocation({
      userId: "u-1",
      toolName: "fetch",
      outcome: "success",
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: null }),
    );
  });

  it("durationMs is stored as null when not provided", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });
    await auditMcpInvocation({
      userId: "u-1",
      toolName: "fetch",
      outcome: "success",
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: null }),
    );
  });

  it("durationMs is passed through when provided", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });
    await auditMcpInvocation({
      userId: "u-1",
      toolName: "fetch",
      outcome: "success",
      durationMs: 123,
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 123 }),
    );
  });

  it("never throws when DB rejects with a non-Error value", async () => {
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue("string error"),
    });
    await expect(
      auditMcpInvocation({ userId: "u-1", toolName: "fetch", outcome: "error" }),
    ).resolves.toBeUndefined();
  });

  it("outcome='success' is stored correctly", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });
    await auditMcpInvocation({ userId: "u-2", toolName: "search", outcome: "success" });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "success" }),
    );
  });

  it("explicit teamId=null is stored as null", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: valuesMock,
    });
    await auditMcpInvocation({
      userId: "u-3",
      teamId: null,
      toolName: "write",
      outcome: "success",
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: null }),
    );
  });
});

describe("auditMcpInvocation — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });
  });

  it("insert called with toolName matching input", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });
    await auditMcpInvocation({ userId: "u-1", toolName: "my_tool", outcome: "success" });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ toolName: "my_tool" }));
  });

  it("always returns undefined", async () => {
    const result = await auditMcpInvocation({ userId: "u-1", toolName: "tool", outcome: "success" });
    expect(result).toBeUndefined();
  });

  it("insert called exactly once when durationMs is provided", async () => {
    await auditMcpInvocation({ userId: "u-1", toolName: "tool", outcome: "success", durationMs: 99 });
    expect(mockPgDb.insert).toHaveBeenCalledTimes(1);
  });

  it("stores userId matching input", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });
    await auditMcpInvocation({ userId: "specific-user", toolName: "t", outcome: "error" });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "specific-user" }));
  });

  it("durationMs=0 is stored as 0 not null", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });
    await auditMcpInvocation({ userId: "u-1", toolName: "t", outcome: "success", durationMs: 0 });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 0 }));
  });
});

describe("auditMcpInvocation — response invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });
  });

  it("always resolves to undefined regardless of toolName", async () => {
    const result = await auditMcpInvocation({ userId: "u-inv", toolName: "any_tool", outcome: "success" });
    expect(result).toBeUndefined();
  });

  it("insert called exactly once regardless of DB error type", async () => {
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    await auditMcpInvocation({ userId: "u-inv", toolName: "t", outcome: "error" });
    expect(mockPgDb.insert).toHaveBeenCalledTimes(1);
  });

  it("resolves to undefined even when durationMs is 0", async () => {
    const result = await auditMcpInvocation({ userId: "u-inv", toolName: "t", outcome: "success", durationMs: 0 });
    expect(result).toBeUndefined();
  });

  it("insert receives a plain object not a primitive", async () => {
    const valuesMock = vi.fn().mockResolvedValue([]);
    (mockPgDb.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: valuesMock });
    await auditMcpInvocation({ userId: "u-obj", toolName: "tool", outcome: "success" });
    const arg = valuesMock.mock.calls[0][0];
    expect(typeof arg).toBe("object");
    expect(arg).not.toBeNull();
  });
});
