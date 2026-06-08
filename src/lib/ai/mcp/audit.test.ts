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
});
