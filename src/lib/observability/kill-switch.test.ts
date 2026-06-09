import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./slo", () => ({
  killSwitchActivations: { inc: vi.fn() },
}));

const mockSelect = vi.fn();
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelect(),
        }),
      }),
    }),
  },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeFeatureFlagTable: { name: "name", enabled: "enabled" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import {
  isKillSwitchActive,
  checkKillSwitch,
  _resetKillSwitchCache,
} from "./kill-switch";
import { killSwitchActivations } from "./slo";

beforeEach(() => {
  _resetKillSwitchCache();
  mockSelect.mockClear();
  (killSwitchActivations.inc as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  _resetKillSwitchCache();
});

describe("kill-switch — DB flag path", () => {
  it("returns false when kill_switch row is enabled=false", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    expect(await isKillSwitchActive()).toBe(false);
  });

  it("returns true when kill_switch row is enabled=true", async () => {
    mockSelect.mockResolvedValue([{ enabled: true }]);
    expect(await isKillSwitchActive()).toBe(true);
  });

  it("returns false (fail-open) when row is missing", async () => {
    mockSelect.mockResolvedValue([]);
    expect(await isKillSwitchActive()).toBe(false);
  });

  it("returns false (fail-open) when DB throws", async () => {
    mockSelect.mockRejectedValue(new Error("db connection refused"));
    expect(await isKillSwitchActive()).toBe(false);
  });
});

describe("kill-switch — 5-second in-process cache", () => {
  it("does not query DB twice within cache window", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    await isKillSwitchActive();
    await isKillSwitchActive();
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("re-queries DB after cache is manually reset", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    await isKillSwitchActive();
    _resetKillSwitchCache();
    await isKillSwitchActive();
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("returns cached value without hitting DB on second call", async () => {
    // First call: enabled=true → caches true
    mockSelect.mockResolvedValueOnce([{ enabled: true }]);
    // Second call: if cache is working, this value is never read
    mockSelect.mockResolvedValueOnce([{ enabled: false }]);
    const first = await isKillSwitchActive();
    const second = await isKillSwitchActive();
    expect(first).toBe(true);
    expect(second).toBe(true); // still cached
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});

describe("kill-switch — checkKillSwitch()", () => {
  it("returns null when kill switch is inactive", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    expect(await checkKillSwitch("team-42")).toBeNull();
  });

  it("returns 503 JSON response when kill switch is active", async () => {
    mockSelect.mockResolvedValue([{ enabled: true }]);
    const resp = await checkKillSwitch("team-42");
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(503);
    const body = await resp!.json();
    expect(body.message).toMatch(/temporarily unavailable/i);
  });

  it("increments killSwitchActivations counter when active", async () => {
    mockSelect.mockResolvedValue([{ enabled: true }]);
    await checkKillSwitch("team-42");
    expect(killSwitchActivations.inc).toHaveBeenCalledTimes(1);
  });

  it("does NOT increment counter when inactive", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    await checkKillSwitch("team-42");
    expect(killSwitchActivations.inc).not.toHaveBeenCalled();
  });

  it("accepts undefined teamId", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    await expect(checkKillSwitch(undefined)).resolves.toBeNull();
  });

  it("accepts null teamId", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    await expect(checkKillSwitch(null)).resolves.toBeNull();
  });

  it("caches state so two active checks only hit DB once", async () => {
    mockSelect.mockResolvedValue([{ enabled: true }]);
    await checkKillSwitch(null);
    await checkKillSwitch(null);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});

describe("kill-switch — _resetKillSwitchCache()", () => {
  it("allows re-reading a changed flag value after reset", async () => {
    mockSelect.mockResolvedValueOnce([{ enabled: false }]);
    expect(await isKillSwitchActive()).toBe(false);

    _resetKillSwitchCache();
    mockSelect.mockResolvedValueOnce([{ enabled: true }]);
    expect(await isKillSwitchActive()).toBe(true);
  });
});

describe("kill-switch — response invariants", () => {
  it("checkKillSwitch returns a Response instance when active", async () => {
    mockSelect.mockResolvedValue([{ enabled: true }]);
    const resp = await checkKillSwitch("team-1");
    expect(resp).toBeInstanceOf(Response);
  });

  it("503 response Content-Type contains application/json", async () => {
    mockSelect.mockResolvedValue([{ enabled: true }]);
    const resp = await checkKillSwitch("t1");
    expect(resp!.headers.get("content-type")).toContain("application/json");
  });

  it("isKillSwitchActive returns a boolean", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    const result = await isKillSwitchActive();
    expect(typeof result).toBe("boolean");
  });

  it("DB is queried exactly once on first call after reset", async () => {
    mockSelect.mockResolvedValue([{ enabled: false }]);
    await isKillSwitchActive();
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
