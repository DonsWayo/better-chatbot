import { describe, expect, it } from "vitest";

import {
  type AgentSessionShapeRow,
  fingerprintRunSession,
  fingerprintRunSessions,
  hasNonTerminalRun,
  isNonTerminalRunStatus,
  NON_TERMINAL_RUN_STATUSES,
} from "./run-session-shape";

/**
 * These helpers ARE the mount gate. The Runs rail (app-sidebar-runs.tsx)
 * renders <RunSessionsLive> only inside the branch guarded by
 * `runs?.some((r) => NON_TERMINAL.includes(r.status))` — the same predicate as
 * `hasNonTerminalRun`. The /runs/[id] page mounts <RunSessionLive> only when
 * `isNonTerminalRunStatus(session.status)`. So asserting these predicates
 * proves, by construction, when the Electric subscriber mounts (and opens a
 * connection) vs. when it does not.
 */

const COMPLETED: AgentSessionShapeRow = { id: "a", status: "completed" };
const FAILED: AgentSessionShapeRow = { id: "b", status: "failed" };
const CANCELLED: AgentSessionShapeRow = { id: "c", status: "cancelled" };
const RUNNING: AgentSessionShapeRow = { id: "d", status: "running" };

describe("run subscription mount gate", () => {
  it("treats exactly queued/running/awaiting_approval/paused as non-terminal", () => {
    expect(NON_TERMINAL_RUN_STATUSES).toEqual([
      "queued",
      "running",
      "awaiting_approval",
      "paused",
    ]);
    for (const status of NON_TERMINAL_RUN_STATUSES) {
      expect(isNonTerminalRunStatus(status)).toBe(true);
    }
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(isNonTerminalRunStatus(status)).toBe(false);
    }
  });

  // The regression-avoiding invariant: NO live run -> the rail does NOT mount
  // the subscriber -> no Electric connection -> network idles.
  it("does NOT mount when there are zero runs (idle page)", () => {
    expect(hasNonTerminalRun([])).toBe(false);
    expect(hasNonTerminalRun(undefined)).toBe(false);
    expect(hasNonTerminalRun(null)).toBe(false);
  });

  it("does NOT mount when every run is terminal (settings/name-sync/permissions e2e case)", () => {
    expect(hasNonTerminalRun([COMPLETED, FAILED, CANCELLED])).toBe(false);
  });

  it("DOES mount when at least one run is non-terminal", () => {
    expect(hasNonTerminalRun([RUNNING])).toBe(true);
    expect(hasNonTerminalRun([COMPLETED, FAILED, RUNNING])).toBe(true);
    expect(hasNonTerminalRun([{ status: "awaiting_approval" }])).toBe(true);
  });
});

describe("fingerprintRunSessions (rail change signal)", () => {
  it("is stable across row reordering", () => {
    const a = fingerprintRunSessions([RUNNING, COMPLETED]);
    const b = fingerprintRunSessions([COMPLETED, RUNNING]);
    expect(a).toBe(b);
  });

  it("changes when a run flips status", () => {
    const before = fingerprintRunSessions([{ id: "d", status: "running" }]);
    const after = fingerprintRunSessions([{ id: "d", status: "completed" }]);
    expect(before).not.toBe(after);
  });

  it("changes when cost accrues or a run starts/ends", () => {
    const base: AgentSessionShapeRow = { id: "d", status: "running" };
    expect(fingerprintRunSessions([base])).not.toBe(
      fingerprintRunSessions([{ ...base, cost_so_far: "0.5" }]),
    );
    expect(fingerprintRunSessions([base])).not.toBe(
      fingerprintRunSessions([{ ...base, ended_at: "2026-01-01T00:00:00Z" }]),
    );
  });

  it("changes when a run is added or removed", () => {
    const one = fingerprintRunSessions([RUNNING]);
    const two = fingerprintRunSessions([RUNNING, COMPLETED]);
    expect(one).not.toBe(two);
  });
});

describe("fingerprintRunSession (single-run page change signal)", () => {
  it("returns null when the run is absent from the shape", () => {
    expect(fingerprintRunSession([RUNNING], "missing")).toBeNull();
  });

  it("changes when the watched run changes, ignores other rows", () => {
    const rows: AgentSessionShapeRow[] = [
      { id: "d", status: "running", cost_so_far: "0.1" },
      COMPLETED,
    ];
    const before = fingerprintRunSession(rows, "d");
    const afterOther = fingerprintRunSession(
      [{ id: "d", status: "running", cost_so_far: "0.1" }, RUNNING],
      "d",
    );
    expect(before).toBe(afterOther); // unrelated row changed -> no change for "d"

    const afterSelf = fingerprintRunSession(
      [{ id: "d", status: "completed", cost_so_far: "0.2" }],
      "d",
    );
    expect(before).not.toBe(afterSelf);
  });
});
