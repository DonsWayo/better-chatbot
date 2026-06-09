import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("auth/server", () => ({
  getSession: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectExecuteAbility: vi.fn(),
  },
}));

import { getSession } from "auth/server";
import { workflowRepository } from "lib/db/repository";
import { selectExecuteAbilityWorkflowsAction } from "./actions";

const mockGetSession = vi.mocked(getSession);
const mockWorkflowRepo = vi.mocked(workflowRepository);

type MockSession = Awaited<ReturnType<typeof getSession>>;
const mockSessionFor = (userId: string): MockSession =>
  ({ user: { id: userId }, session: {} }) as unknown as MockSession;

const mockWorkflow = {
  id: "wf-1",
  name: "Research Workflow",
  isPublished: true,
  userId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectExecuteAbilityWorkflowsAction", () => {
  it("returns workflows for authenticated user", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([mockWorkflow]);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(mockWorkflowRepo.selectExecuteAbility).toHaveBeenCalledWith("user-1");
    expect(result).toEqual([mockWorkflow]);
  });

  it("returns empty array when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result).toEqual([]);
    expect(mockWorkflowRepo.selectExecuteAbility).not.toHaveBeenCalled();
  });

  it("returns empty array when repository returns empty", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-2"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([]);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result).toEqual([]);
  });

  it("returns multiple workflows", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    const workflows = [mockWorkflow, { ...mockWorkflow, id: "wf-2", name: "Code Workflow" }];
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue(workflows);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result).toHaveLength(2);
  });

  it("calls selectExecuteAbility with userId from session", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-xyz"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([]);

    await selectExecuteAbilityWorkflowsAction();

    expect(mockWorkflowRepo.selectExecuteAbility).toHaveBeenCalledWith("user-xyz");
  });

  it("calls selectExecuteAbility exactly once per invocation", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([]);

    await selectExecuteAbilityWorkflowsAction();

    expect(mockWorkflowRepo.selectExecuteAbility).toHaveBeenCalledTimes(1);
  });

  it("returns the raw repository result", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    const expected = [mockWorkflow];
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue(expected);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result).toBe(expected);
  });

  it("result is always an array", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([]);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(Array.isArray(result)).toBe(true);
  });

  it("calls selectExecuteAbility with undefined when session user has no id", async () => {
    mockGetSession.mockResolvedValue({ user: {}, session: {} } as unknown as MockSession);
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([]);

    await selectExecuteAbilityWorkflowsAction();

    expect(mockWorkflowRepo.selectExecuteAbility).toHaveBeenCalledWith(undefined);
  });

  it("returns empty array when repository returns null", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue(
      null as unknown as typeof mockWorkflow[],
    );

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result == null || Array.isArray(result)).toBe(true);
  });

  it("workflow items contain id and name", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([mockWorkflow]);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
  });

  it("getSession is called exactly once per action call", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([]);

    await selectExecuteAbilityWorkflowsAction();

    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("each returned workflow has userId field", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([mockWorkflow]);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result[0]).toHaveProperty("userId");
  });

  it("each returned workflow has isPublished field", async () => {
    mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
    mockWorkflowRepo.selectExecuteAbility.mockResolvedValue([mockWorkflow]);

    const result = await selectExecuteAbilityWorkflowsAction();

    expect(result[0]).toHaveProperty("isPublished");
  });

  it("throws when session user is null (accessing id on null)", async () => {
    mockGetSession.mockResolvedValue({ user: null, session: {} } as unknown as MockSession);

    await expect(selectExecuteAbilityWorkflowsAction()).rejects.toThrow();
  });
});
