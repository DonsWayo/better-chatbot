import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, selectExecuteAbilityMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectExecuteAbilityMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectExecuteAbility: selectExecuteAbilityMock },
}));

describe("selectExecuteAbilityWorkflowsAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns empty array when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    const result = await selectExecuteAbilityWorkflowsAction();
    expect(result).toEqual([]);
    expect(selectExecuteAbilityMock).not.toHaveBeenCalled();
  });

  it("returns workflows for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([
      { id: "w1", name: "Workflow 1" },
      { id: "w2", name: "Workflow 2" },
    ]);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    const result = await selectExecuteAbilityWorkflowsAction();
    expect(result).toHaveLength(2);
    expect(selectExecuteAbilityMock).toHaveBeenCalledWith("u1");
  });

  it("returns empty array when user has no workflows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u2" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    const result = await selectExecuteAbilityWorkflowsAction();
    expect(result).toEqual([]);
  });

  it("passes exact userId to selectExecuteAbility", async () => {
    const userId = "user-specific-id-123";
    getSessionMock.mockResolvedValue({ user: { id: userId } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    await selectExecuteAbilityWorkflowsAction();
    expect(selectExecuteAbilityMock).toHaveBeenCalledWith(userId);
  });

  it("calls selectExecuteAbility exactly once per invocation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u3" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    await selectExecuteAbilityWorkflowsAction();
    expect(selectExecuteAbilityMock).toHaveBeenCalledTimes(1);
  });

  it("returns all workflows returned by repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u4" } });
    const workflows = [
      { id: "wf-1", name: "Deploy" },
      { id: "wf-2", name: "Review" },
      { id: "wf-3", name: "Notify" },
    ];
    selectExecuteAbilityMock.mockResolvedValueOnce(workflows);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    const result = await selectExecuteAbilityWorkflowsAction();
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("wf-1");
    expect(result[2].name).toBe("Notify");
  });

  it("returns identity of what repository returns (no transformation)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u5" } });
    const REPO_RESULT = [{ id: "w-identity", name: "Identity Test", extra: true }];
    selectExecuteAbilityMock.mockResolvedValueOnce(REPO_RESULT);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    const result = await selectExecuteAbilityWorkflowsAction();
    expect(result).toEqual(REPO_RESULT);
  });

  it("does not call getSession more than once per invocation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u6" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    await selectExecuteAbilityWorkflowsAction();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("propagates repository error to caller", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u7" } });
    selectExecuteAbilityMock.mockRejectedValueOnce(new Error("db timeout"));
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    await expect(selectExecuteAbilityWorkflowsAction()).rejects.toThrow("db timeout");
  });

  it("result is always an array (never null/undefined) when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    const result = await selectExecuteAbilityWorkflowsAction();
    expect(Array.isArray(result)).toBe(true);
  });

  it("getSession is called exactly once per invocation when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectExecuteAbilityWorkflowsAction } = await import("./actions");
    await selectExecuteAbilityWorkflowsAction();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
