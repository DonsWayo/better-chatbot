import { describe, it, expect, beforeEach, vi } from "vitest";

const { generateUUIDMock } = vi.hoisted(() => ({
  generateUUIDMock: vi.fn(() => "mock-uuid"),
}));

vi.mock("lib/utils", () => ({
  generateUUID: generateUUIDMock,
  generateUniqueKey: vi.fn((prefix: string) => prefix),
}));

vi.mock("@/app/store", () => ({
  appStore: {
    getState: vi.fn(() => ({ chatModel: null })),
  },
}));

import { useWorkflowStore } from "./workflow.store";
import type { DBWorkflow } from "app-types/workflow";

const makeWorkflow = (overrides: Partial<DBWorkflow> = {}): DBWorkflow =>
  ({
    id: "wf-1",
    name: "Test Workflow",
    userId: "user-1",
    isPublished: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    nodes: [],
    edges: [],
    ...overrides,
  }) as unknown as DBWorkflow;

beforeEach(() => {
  useWorkflowStore.setState({
    workflow: undefined,
    processIds: [],
    hasEditAccess: undefined,
  });
  vi.clearAllMocks();
  generateUUIDMock.mockReturnValue("mock-uuid");
});

describe("useWorkflowStore — initial state", () => {
  it("starts with empty processIds", () => {
    expect(useWorkflowStore.getState().processIds).toEqual([]);
  });

  it("starts with undefined workflow", () => {
    expect(useWorkflowStore.getState().workflow).toBeUndefined();
  });

  it("starts with undefined hasEditAccess", () => {
    expect(useWorkflowStore.getState().hasEditAccess).toBeUndefined();
  });

  it("has init and addProcess functions", () => {
    const state = useWorkflowStore.getState();
    expect(typeof state.init).toBe("function");
    expect(typeof state.addProcess).toBe("function");
  });
});

describe("useWorkflowStore — init", () => {
  it("sets workflow after init", () => {
    const workflow = makeWorkflow({ id: "wf-42" });
    useWorkflowStore.getState().init(workflow);
    expect(useWorkflowStore.getState().workflow?.id).toBe("wf-42");
  });

  it("sets hasEditAccess true", () => {
    useWorkflowStore.getState().init(undefined, true);
    expect(useWorkflowStore.getState().hasEditAccess).toBe(true);
  });

  it("sets hasEditAccess false", () => {
    useWorkflowStore.getState().init(undefined, false);
    expect(useWorkflowStore.getState().hasEditAccess).toBe(false);
  });

  it("resets processIds on init", () => {
    useWorkflowStore.setState({ processIds: ["p-1", "p-2"] });
    useWorkflowStore.getState().init(undefined);
    expect(useWorkflowStore.getState().processIds).toEqual([]);
  });

  it("resets workflow to undefined when called with undefined", () => {
    useWorkflowStore.setState({ workflow: makeWorkflow() });
    useWorkflowStore.getState().init(undefined);
    expect(useWorkflowStore.getState().workflow).toBeUndefined();
  });

  it("overwrites existing workflow with new one", () => {
    useWorkflowStore.getState().init(makeWorkflow({ id: "wf-1" }));
    useWorkflowStore.getState().init(makeWorkflow({ id: "wf-2" }));
    expect(useWorkflowStore.getState().workflow?.id).toBe("wf-2");
  });

  it("clears hasEditAccess when undefined is passed", () => {
    useWorkflowStore.getState().init(undefined, true);
    useWorkflowStore.getState().init(undefined, undefined);
    expect(useWorkflowStore.getState().hasEditAccess).toBeUndefined();
  });
});

describe("useWorkflowStore — addProcess", () => {
  it("adds a processId to the list", () => {
    generateUUIDMock.mockReturnValue("proc-abc");
    useWorkflowStore.getState().addProcess();
    expect(useWorkflowStore.getState().processIds).toContain("proc-abc");
  });

  it("returns a cleanup function", () => {
    const cleanup = useWorkflowStore.getState().addProcess();
    expect(typeof cleanup).toBe("function");
  });

  it("cleanup removes the specific processId", () => {
    generateUUIDMock.mockReturnValue("proc-xyz");
    const cleanup = useWorkflowStore.getState().addProcess();
    expect(useWorkflowStore.getState().processIds).toContain("proc-xyz");
    cleanup();
    expect(useWorkflowStore.getState().processIds).not.toContain("proc-xyz");
  });

  it("multiple addProcess calls accumulate processIds", () => {
    generateUUIDMock.mockReturnValueOnce("p-1").mockReturnValueOnce("p-2");
    useWorkflowStore.getState().addProcess();
    useWorkflowStore.getState().addProcess();
    expect(useWorkflowStore.getState().processIds).toHaveLength(2);
  });

  it("cleanup only removes the specific processId, not others", () => {
    generateUUIDMock.mockReturnValueOnce("p-1").mockReturnValueOnce("p-2");
    const cleanup1 = useWorkflowStore.getState().addProcess();
    useWorkflowStore.getState().addProcess();
    cleanup1();
    expect(useWorkflowStore.getState().processIds).not.toContain("p-1");
    expect(useWorkflowStore.getState().processIds).toContain("p-2");
  });

  it("processIds list length equals number of active processes", () => {
    generateUUIDMock
      .mockReturnValueOnce("a-1")
      .mockReturnValueOnce("a-2")
      .mockReturnValueOnce("a-3");
    const c1 = useWorkflowStore.getState().addProcess();
    const c2 = useWorkflowStore.getState().addProcess();
    useWorkflowStore.getState().addProcess();
    c1();
    c2();
    expect(useWorkflowStore.getState().processIds).toHaveLength(1);
    expect(useWorkflowStore.getState().processIds).toContain("a-3");
  });

  it("cleanup is idempotent when called multiple times", () => {
    generateUUIDMock.mockReturnValue("idem-proc");
    const cleanup = useWorkflowStore.getState().addProcess();
    cleanup();
    cleanup();
    expect(useWorkflowStore.getState().processIds).not.toContain("idem-proc");
  });
});
