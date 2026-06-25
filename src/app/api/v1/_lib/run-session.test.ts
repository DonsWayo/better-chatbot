/**
 * Unit tests for the governed runWorkflowSession helper. This is the business
 * logic that sits between the POST /api/v1/sessions handler and the platform
 * internals (checkAccess, checkBudget, createSession, runSessionByIdDetached).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkAccessMock,
  selectByIdMock,
  checkBudgetMock,
  createSessionMock,
  runSessionByIdDetachedMock,
} = vi.hoisted(() => ({
  checkAccessMock: vi.fn(),
  selectByIdMock: vi.fn(),
  checkBudgetMock: vi.fn(),
  createSessionMock: vi.fn(),
  runSessionByIdDetachedMock: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    checkAccess: checkAccessMock,
    selectById: selectByIdMock,
  },
}));
vi.mock("lib/ai/budget", () => ({
  checkBudget: checkBudgetMock,
}));
vi.mock("lib/agent-platform/sessions", () => ({
  createSession: createSessionMock,
}));
vi.mock("lib/agent-platform/worker", () => ({
  runSessionByIdDetached: runSessionByIdDetachedMock,
}));
// logger is imported by run-session; stub it to suppress output in test runs
vi.mock("logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { runWorkflowSession } from "./run-session";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

beforeEach(() => {
  vi.clearAllMocks();
  checkAccessMock.mockResolvedValue(true);
  checkBudgetMock.mockResolvedValue({ allowed: true });
  createSessionMock.mockResolvedValue({ id: "s1", status: "queued" });
  runSessionByIdDetachedMock.mockResolvedValue(undefined);
});

describe("runWorkflowSession", () => {
  it("returns not_found when the workflow does not exist", async () => {
    checkAccessMock.mockResolvedValueOnce(false);
    selectByIdMock.mockResolvedValueOnce(null);
    const result = await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf-ghost",
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_found");
    }
  });

  it("returns forbidden when workflow exists but principal cannot access it", async () => {
    checkAccessMock.mockResolvedValueOnce(false);
    selectByIdMock.mockResolvedValueOnce({ id: "wf1" }); // exists
    const result = await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("forbidden");
    }
  });

  it("returns budget_exhausted when the team budget is exhausted", async () => {
    checkBudgetMock.mockResolvedValueOnce({
      allowed: false,
      reason: "Team budget exhausted",
    });
    const result = await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("budget_exhausted");
      expect(result.message).toContain("budget");
    }
  });

  it("creates a session with the correct surface and kind on success", async () => {
    const result = await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: { key: "value" },
    });
    expect(result.ok).toBe(true);
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "workflow",
        definitionId: "wf1",
        userId: "u1",
        teamId: "t1",
        originSurface: "api",
        inputPayload: { key: "value" },
      }),
    );
  });

  it("returns the session id and queued status on success", async () => {
    const result = await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessionId).toBe("s1");
      expect(result.status).toBe("queued");
    }
  });

  it("fires runSessionByIdDetached as a detached kick (fire-and-forget)", async () => {
    await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: {},
    });
    expect(runSessionByIdDetachedMock).toHaveBeenCalledWith("s1");
  });

  it("still returns ok:true even if the detached kick rejects (error is swallowed)", async () => {
    runSessionByIdDetachedMock.mockRejectedValueOnce(new Error("worker down"));
    const result = await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: {},
    });
    expect(result.ok).toBe(true);
  });

  it("uses a null inputPayload when input is not provided", async () => {
    await runWorkflowSession({
      principal: PRINCIPAL,
      workflowId: "wf1",
      input: undefined,
    });
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ inputPayload: {} }),
    );
  });

  it("passes teamId from the principal to checkBudget", async () => {
    await runWorkflowSession({
      principal: { ...PRINCIPAL, teamId: "team-abc" },
      workflowId: "wf1",
      input: {},
    });
    expect(checkBudgetMock).toHaveBeenCalledWith("u1", "team-abc");
  });
});
