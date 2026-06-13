import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersistableGraphEvent,
  SubscribableExecutor,
} from "./persistent-executor";

const {
  startSessionMock,
  completeSessionMock,
  failSessionMock,
  recordStepMock,
  touchHeartbeatMock,
  completeRunningStepsMock,
  sumStepCostMock,
} = vi.hoisted(() => ({
  startSessionMock: vi.fn(async () => null),
  completeSessionMock: vi.fn(async () => null),
  failSessionMock: vi.fn(async () => null),
  recordStepMock: vi.fn(async () => ({ id: "step-1" })),
  touchHeartbeatMock: vi.fn(async () => undefined),
  completeRunningStepsMock: vi.fn(async () => 0),
  sumStepCostMock: vi.fn(async () => 0),
}));

vi.mock("./sessions", () => ({
  startSession: startSessionMock,
  completeSession: completeSessionMock,
  failSession: failSessionMock,
  recordStep: recordStepMock,
  touchHeartbeat: touchHeartbeatMock,
  completeRunningSteps: completeRunningStepsMock,
  sumStepCost: sumStepCostMock,
}));

vi.mock("server-only", () => ({}));

vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn() }),
  },
}));

/** Fake executor that captures the subscribed handler so tests can emit. */
function makeFakeExecutor() {
  let handler: ((event: PersistableGraphEvent) => unknown) | null = null;
  const unsubscribe = vi.fn();
  const executor: SubscribableExecutor = {
    subscribe: vi.fn((h: (event: PersistableGraphEvent) => unknown) => {
      handler = h;
    }),
    unsubscribe,
  };
  return {
    executor,
    unsubscribe,
    emit(event: PersistableGraphEvent) {
      if (!handler) throw new Error("no handler subscribed");
      handler(event);
    },
  };
}

/**
 * Fake executor carrying a WorkflowExecutorContext (the per-node store
 * accessor real executors attach) so persistence reads each node's OWN
 * input/output/cost/kind instead of the whole-graph event blob.
 */
function makeContextExecutor(slices: {
  outputs?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  costs?: Record<string, number>;
  kinds?: Record<string, string>;
}) {
  let handler: ((event: PersistableGraphEvent) => unknown) | null = null;
  const unsubscribe = vi.fn();
  const executor = {
    subscribe: vi.fn((h: (event: PersistableGraphEvent) => unknown) => {
      handler = h;
    }),
    unsubscribe,
    // Same non-enumerable key createWorkflowExecutor attaches.
    __asafeWorkflowContext: {
      getNodeOutput: (id: string) => slices.outputs?.[id],
      getNodeInput: (id: string) => slices.inputs?.[id],
      getNodeCost: (id: string) => slices.costs?.[id],
      getNodeKind: (id: string) => slices.kinds?.[id],
      getAllOutputs: () => slices.outputs ?? {},
    },
  } as unknown as SubscribableExecutor;
  return {
    executor,
    emit(event: PersistableGraphEvent) {
      if (!handler) throw new Error("no handler subscribed");
      handler(event);
    },
  };
}

/** Let the fire-and-forget promises inside the handler settle. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("attachSessionPersistence", () => {
  it("WORKFLOW_START → startSession(sessionId)", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({ eventType: "WORKFLOW_START" });
    await flush();
    expect(startSessionMock).toHaveBeenCalledWith("sess-1");
  });

  it("NODE_START/NODE_END pair records two steps with the same stepIndex (running → completed)", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-a", input: { q: "hi" } },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: true,
      node: { name: "node-a", output: { answer: 42 } },
    });
    await flush();
    expect(recordStepMock).toHaveBeenCalledTimes(2);
    const [startCall, endCall] = recordStepMock.mock.calls as unknown as [
      [string, Record<string, unknown>],
      [string, Record<string, unknown>],
    ];
    expect(startCall[0]).toBe("sess-1");
    expect(startCall[1]).toMatchObject({
      nodeId: "node-a",
      stepIndex: 0,
      status: "running",
      input: { q: "hi" },
    });
    expect(endCall[1]).toMatchObject({
      nodeId: "node-a",
      stepIndex: 0,
      status: "completed",
      output: { answer: 42 },
    });
  });

  it("assigns incrementing stepIndex to successive nodes", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-a" },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: true,
      node: { name: "node-a" },
    });
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-2",
      node: { name: "node-b" },
    });
    await flush();
    // Each node's recordStep gets the stepIndex its NODE_START assigned;
    // node-a → 0 (start+end), node-b → 1. (Write ordering may interleave
    // because per-step writes are serialized, so assert by node, not by call
    // order.)
    const byNode = new Map<string, Set<number>>();
    for (const [, step] of recordStepMock.mock.calls as unknown as [
      string,
      { nodeId: string; stepIndex: number },
    ][]) {
      const set = byNode.get(step.nodeId) ?? new Set<number>();
      set.add(step.stepIndex);
      byNode.set(step.nodeId, set);
    }
    expect([...(byNode.get("node-a") ?? [])]).toEqual([0]);
    expect([...(byNode.get("node-b") ?? [])]).toEqual([1]);
  });

  it("failed NODE_END records status failed with the error message", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-a" },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: false,
      error: { message: "llm timeout" },
      node: { name: "node-a" },
    });
    await flush();
    const endCall = recordStepMock.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(endCall[1]).toMatchObject({
      status: "failed",
      error: "llm timeout",
      stepIndex: 0,
    });
  });

  it("WORKFLOW_END ok → sweeps running steps, rolls up cost, completeSession", async () => {
    sumStepCostMock.mockResolvedValueOnce(0.0042);
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({ eventType: "WORKFLOW_END", isOk: true });
    await flush();
    // #2: still-running steps are swept to completed.
    expect(completeRunningStepsMock).toHaveBeenCalledWith("sess-1");
    // #3: the per-step cost sum is rolled into the session.
    expect(sumStepCostMock).toHaveBeenCalledWith("sess-1");
    expect(completeSessionMock).toHaveBeenCalledWith("sess-1", {
      costSoFar: 0.0042,
    });
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it("WORKFLOW_END not ok → failSession with the error message", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "WORKFLOW_END",
      isOk: false,
      error: { message: "graph blew up" },
    });
    await flush();
    expect(failSessionMock).toHaveBeenCalledWith("sess-1", "graph blew up");
    expect(completeSessionMock).not.toHaveBeenCalled();
  });

  it("WORKFLOW_END with ApprovalPendingError → neither failed nor completed (run stays parked)", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const { ApprovalPendingError } = await import("./approval-error");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "WORKFLOW_END",
      isOk: false,
      error: new ApprovalPendingError("sess-1", "approval-1"),
    });
    await flush();
    expect(failSessionMock).not.toHaveBeenCalled();
    expect(completeSessionMock).not.toHaveBeenCalled();
  });

  it("touches the heartbeat on every NODE event", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-a" },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: true,
      node: { name: "node-a" },
    });
    await flush();
    expect(touchHeartbeatMock).toHaveBeenCalledTimes(2);
    expect(touchHeartbeatMock).toHaveBeenCalledWith("sess-1");
  });

  it("persistence rejections never propagate to the emitter (fire-and-forget)", async () => {
    startSessionMock.mockRejectedValueOnce(new Error("db down"));
    recordStepMock.mockRejectedValueOnce(new Error("db down"));
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    expect(() => {
      fake.emit({ eventType: "WORKFLOW_START" });
      fake.emit({
        eventType: "NODE_START",
        nodeExecutionId: "exec-1",
        node: { name: "node-a" },
      });
    }).not.toThrow();
    await expect(flush()).resolves.toBeUndefined();
  });

  it("synchronously throwing persistence functions do not break the handler", async () => {
    touchHeartbeatMock.mockImplementationOnce(() => {
      throw new Error("sync explosion");
    });
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    expect(() =>
      fake.emit({
        eventType: "NODE_START",
        nodeExecutionId: "exec-1",
        node: { name: "node-a" },
      }),
    ).not.toThrow();
  });

  it("ignores the internal SKIP sink node entirely", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-skip",
      node: { name: "SKIP" },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-skip",
      isOk: true,
      node: { name: "SKIP" },
    });
    await flush();
    expect(recordStepMock).not.toHaveBeenCalled();
    expect(touchHeartbeatMock).not.toHaveBeenCalled();
  });

  it("ignores NODE_STREAM and unknown event kinds", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({ eventType: "NODE_STREAM" });
    fake.emit({ eventType: "SOMETHING_ELSE" });
    await flush();
    expect(startSessionMock).not.toHaveBeenCalled();
    expect(recordStepMock).not.toHaveBeenCalled();
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it("returns a cleanup function that unsubscribes the handler", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    const cleanup = attachSessionPersistence(fake.executor, "sess-1");
    expect(typeof cleanup).toBe("function");
    cleanup();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cleanup is a safe no-op when the executor has no unsubscribe", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    let handler: ((event: PersistableGraphEvent) => unknown) | null = null;
    const executor: SubscribableExecutor = {
      subscribe: (h) => {
        handler = h;
      },
    };
    const cleanup = attachSessionPersistence(executor, "sess-1");
    expect(() => cleanup()).not.toThrow();
    expect(handler).not.toBeNull();
  });
});

describe("attachSessionPersistence with executor context (#21 store-backed)", () => {
  it("NODE_END records the node's OWN output/input/kind/cost from the store, not the whole-graph event blob", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeContextExecutor({
      outputs: { "node-a": { answer: "hi", totalTokens: 12 } },
      inputs: { "node-a": { messages: [], chatModel: { model: "m" } } },
      costs: { "node-a": 0.0009 },
      kinds: { "node-a": "llm" },
    });
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      // The real event carries the WHOLE graph state here — must be ignored.
      node: { name: "node-a", input: { outputs: {}, nodes: [], edges: [] } },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: true,
      // Whole-graph blob on the event — must NOT be persisted.
      node: {
        name: "node-a",
        output: { outputs: {}, inputs: {}, nodes: [], edges: [] },
      },
    });
    await flush();
    const startCall = recordStepMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    // NODE_START records the kind but NOT the whole-graph event input.
    expect(startCall[1]).toMatchObject({
      nodeId: "node-a",
      stepIndex: 0,
      status: "running",
      nodeKind: "llm",
    });
    expect(startCall[1].input).toBeUndefined();

    const endCall = recordStepMock.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(endCall[1]).toMatchObject({
      nodeId: "node-a",
      stepIndex: 0,
      status: "completed",
      nodeKind: "llm",
      output: { answer: "hi", totalTokens: 12 },
      input: { messages: [], chatModel: { model: "m" } },
      costUsd: 0.0009,
    });
    // Crucially: the recorded output is the per-node slice, not the graph.
    expect(endCall[1].output).not.toHaveProperty("nodes");
    expect(endCall[1].output).not.toHaveProperty("outputs");
  });

  it("exposes flush() that resolves only after pending writes settle", async () => {
    let resolveStep: ((v: { id: string }) => void) | null = null;
    recordStepMock.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((r) => {
          resolveStep = r;
        }),
    );
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeContextExecutor({ outputs: { "node-a": { ok: 1 } } });
    const handle = attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-a" },
    });

    let flushed = false;
    const flushPromise = handle.flush().then(() => {
      flushed = true;
    });
    // The step write is still in flight — flush must not have resolved.
    await flush();
    expect(flushed).toBe(false);

    resolveStep!({ id: "step-1" });
    await flush();
    await flushPromise;
    expect(flushed).toBe(true);
  });

  it("serializes per-step writes so a slow NODE_START never stomps NODE_END's completed", async () => {
    // Make the NODE_START write slow; NODE_END's write must still land LAST.
    let resolveStart: (() => void) | null = null;
    recordStepMock
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveStart = () => r({ id: "s" });
          }),
      )
      .mockResolvedValue({ id: "s" });

    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeContextExecutor({ outputs: { "node-a": { ok: 1 } } });
    const handle = attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-a" },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: true,
      node: { name: "node-a", output: { outputs: {} } },
    });
    // recordStep is invoked on a microtask (the per-step chain starts from
    // Promise.resolve()); let it start before releasing the slow START write.
    await flush();
    resolveStart!();
    await handle.flush();

    const statuses = (
      recordStepMock.mock.calls as unknown as [string, { status: string }][]
    ).map((c) => c[1].status);
    // START ran before END (serialized), so the LAST write is 'completed'.
    expect(statuses).toEqual(["running", "completed"]);
  });

  it("omits cost/input when the node has none in the store", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeContextExecutor({
      outputs: { "node-b": { template: "rendered" } },
      kinds: { "node-b": "template" },
    });
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({
      eventType: "NODE_START",
      nodeExecutionId: "exec-1",
      node: { name: "node-b" },
    });
    fake.emit({
      eventType: "NODE_END",
      nodeExecutionId: "exec-1",
      isOk: true,
      node: { name: "node-b", output: { outputs: {}, nodes: [] } },
    });
    await flush();
    const endCall = recordStepMock.mock.calls.at(-1) as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(endCall[1]).toMatchObject({
      nodeId: "node-b",
      status: "completed",
      nodeKind: "template",
      output: { template: "rendered" },
    });
    expect(endCall[1].costUsd).toBeUndefined();
    expect(endCall[1].input).toBeUndefined();
  });
});
