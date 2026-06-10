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
} = vi.hoisted(() => ({
  startSessionMock: vi.fn(async () => null),
  completeSessionMock: vi.fn(async () => null),
  failSessionMock: vi.fn(async () => null),
  recordStepMock: vi.fn(async () => ({ id: "step-1" })),
  touchHeartbeatMock: vi.fn(async () => undefined),
}));

vi.mock("./sessions", () => ({
  startSession: startSessionMock,
  completeSession: completeSessionMock,
  failSession: failSessionMock,
  recordStep: recordStepMock,
  touchHeartbeat: touchHeartbeatMock,
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
    const indices = (
      recordStepMock.mock.calls as unknown as [string, { stepIndex: number }][]
    ).map((c) => c[1].stepIndex);
    expect(indices).toEqual([0, 0, 1]);
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

  it("WORKFLOW_END ok → completeSession", async () => {
    const { attachSessionPersistence } = await import("./persistent-executor");
    const fake = makeFakeExecutor();
    attachSessionPersistence(fake.executor, "sess-1");
    fake.emit({ eventType: "WORKFLOW_END", isOk: true });
    await flush();
    expect(completeSessionMock).toHaveBeenCalledWith("sess-1");
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
