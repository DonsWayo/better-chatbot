import "server-only";

import {
  type WorkflowExecutorContext,
  getWorkflowExecutorContext,
} from "lib/ai/workflow/executor/executor-context";
import globalLogger from "logger";
import { isApprovalPending } from "./approval-error";
import {
  completeRunningSteps,
  completeSession,
  failSession,
  recordStep,
  startSession,
  sumStepCost,
  touchHeartbeat,
} from "./sessions";

const logger = globalLogger.withDefaults({
  message: "AgentPlatform SessionPersistence: ",
});

// Structural subset of ts-edge's GraphEvent union (see
// node_modules/ts-edge/dist/index.d.ts) — only the fields persistence needs.
// Keeping it structural lets attachSessionPersistence accept any executor
// created by createWorkflowExecutor without importing its generics.

interface NodeStartEventLike {
  eventType: "NODE_START";
  nodeExecutionId?: string;
  node: { name: string; input?: unknown };
}

interface NodeEndEventLike {
  eventType: "NODE_END";
  nodeExecutionId?: string;
  isOk: boolean;
  error?: { message?: string };
  node: { name: string; input?: unknown; output?: unknown };
}

interface WorkflowStartEventLike {
  eventType: "WORKFLOW_START";
}

interface WorkflowEndEventLike {
  eventType: "WORKFLOW_END";
  isOk: boolean;
  error?: { message?: string };
}

export type PersistableGraphEvent =
  | WorkflowStartEventLike
  | WorkflowEndEventLike
  | NodeStartEventLike
  | NodeEndEventLike
  // NODE_STREAM and any future event kinds are ignored.
  | { eventType: string };

export interface SubscribableExecutor {
  subscribe(handler: (event: PersistableGraphEvent) => unknown): unknown;
  unsubscribe?(handler: (event: PersistableGraphEvent) => unknown): unknown;
}

/** Internal SKIP sink node of the workflow executor — never persisted. */
const SKIP_NODE_NAME = "SKIP";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error ?? "Unknown error");
}

/**
 * Detach handle returned by attachSessionPersistence. Callable to unsubscribe
 * (back-compat with the `() => void` contract the execute route uses), plus a
 * `flush()` for callers that must await all pending writes before the process
 * tears down — the detached worker exits right after run() resolves, and the
 * step writes are fire-and-forget, so without a flush the per-node rows race
 * the exit and are lost (see #21 real-run durability).
 */
export interface SessionPersistenceHandle {
  (): void;
  /** Resolves once every fire-and-forget persistence write has settled. */
  flush(): Promise<void>;
}

/**
 * Subscribes to a workflow executor's GraphEvents and mirrors them into the
 * agent_session / agent_step tables (#21 — docs/design/agent-platform.md):
 *
 *   WORKFLOW_START → session running   NODE_START → step running (insert)
 *   NODE_END       → step completed/failed (upsert on same stepIndex)
 *   WORKFLOW_END   → session completed/failed
 *
 * Every NODE event also touches the session heartbeat so a detached worker
 * can be declared stale and reclaimed. All persistence is fire-and-forget:
 * failures are logged and never propagate to the run.
 *
 * @returns cleanup function that detaches the subscription (no-op when the
 * executor does not expose `unsubscribe`).
 */
export function attachSessionPersistence(
  executor: SubscribableExecutor,
  sessionId: string,
): SessionPersistenceHandle {
  let nextStepIndex = 0;
  // NODE_END must land on the same stepIndex its NODE_START created; key by
  // nodeExecutionId when available (parallel branches), node name otherwise.
  const stepIndexByExecution = new Map<string, number>();

  // Track every fire-and-forget write so a caller (the detached worker) can
  // flush() them before exiting — otherwise the per-node step rows race the
  // process teardown and never land.
  const pending = new Set<Promise<unknown>>();
  const fireAndForget = (promise: Promise<unknown>, context: string): void => {
    const tracked = promise
      .catch((error) => {
        logger.error(`${context} failed:`, error);
      })
      .finally(() => {
        pending.delete(tracked);
      });
    pending.add(tracked);
  };

  // The ts-edge NODE_START/NODE_END event's node.input/node.output are the
  // WHOLE graph state (createStateGraph wraps execute with `.map(() =>
  // store.get())`), not the node's own slice. Pull the per-node
  // input/output/cost/kind from the executor's runtime context instead;
  // fall back to the raw event fields when no context is attached (unit tests
  // that emit synthetic events).
  const context: WorkflowExecutorContext | undefined =
    getWorkflowExecutorContext(executor);

  // node id (== ts-edge node name) of every step we've recorded, so the
  // WORKFLOW_END rollup can seed completeSession with the real per-step sum.
  const seenNodeIds = new Set<string>();

  // Per-stepIndex write chain. NODE_START and NODE_END upsert the SAME
  // (sessionId, stepIndex) row; both writes are fire-and-forget, so without
  // ordering a slow NODE_START can land AFTER NODE_END and stomp 'completed'
  // back to 'running' (observed when an approval abort tightens the timing).
  // Chaining per stepIndex guarantees NODE_END's write always follows its
  // NODE_START's.
  const stepWriteChain = new Map<number, Promise<unknown>>();
  const recordStepSerialized = (
    stepIndex: number,
    step: Parameters<typeof recordStep>[1],
    label: string,
  ): void => {
    const prior = stepWriteChain.get(stepIndex) ?? Promise.resolve();
    const next = prior.then(() => recordStep(sessionId, step));
    stepWriteChain.set(stepIndex, next);
    fireAndForget(next, label);
  };

  const handler = (event: PersistableGraphEvent): void => {
    try {
      switch (event.eventType) {
        case "WORKFLOW_START": {
          fireAndForget(startSession(sessionId), "startSession");
          break;
        }
        case "NODE_START": {
          const evt = event as NodeStartEventLike;
          if (evt.node.name === SKIP_NODE_NAME) break;
          const nodeId = evt.node.name; // ts-edge node name == workflow node id
          const stepIndex = nextStepIndex++;
          stepIndexByExecution.set(evt.nodeExecutionId ?? nodeId, stepIndex);
          seenNodeIds.add(nodeId);
          // node_kind from the executor context (event carries no metadata).
          const nodeKind = context?.getNodeKind(nodeId);
          // node.input on the event is the whole graph state — never persist
          // it; the per-node input lands at NODE_END via the context. Only
          // pass through a synthetic event input when no context is attached.
          const input = context ? undefined : evt.node.input;
          fireAndForget(touchHeartbeat(sessionId), "touchHeartbeat");
          recordStepSerialized(
            stepIndex,
            {
              nodeId,
              stepIndex,
              status: "running",
              ...(nodeKind !== undefined ? { nodeKind } : {}),
              ...(input !== undefined ? { input } : {}),
            },
            "recordStep(NODE_START)",
          );
          break;
        }
        case "NODE_END": {
          const evt = event as NodeEndEventLike;
          if (evt.node.name === SKIP_NODE_NAME) break;
          const nodeId = evt.node.name; // ts-edge node name == workflow node id
          const key = evt.nodeExecutionId ?? nodeId;
          const stepIndex =
            stepIndexByExecution.get(key) ?? Math.max(nextStepIndex - 1, 0);
          stepIndexByExecution.delete(key);
          seenNodeIds.add(nodeId);
          // Per-node output/input/cost/kind from the runtime store. The event's
          // node.output is the WHOLE graph state — using it here is the bug
          // that recorded the entire graph JSON on every step.
          const output = context
            ? context.getNodeOutput(nodeId)
            : evt.node.output;
          const input = context ? context.getNodeInput(nodeId) : undefined;
          const nodeKind = context?.getNodeKind(nodeId);
          const costUsd = context?.getNodeCost(nodeId);
          fireAndForget(touchHeartbeat(sessionId), "touchHeartbeat");
          recordStepSerialized(
            stepIndex,
            {
              nodeId,
              stepIndex,
              status: evt.isOk ? "completed" : "failed",
              ...(nodeKind !== undefined ? { nodeKind } : {}),
              ...(input !== undefined ? { input } : {}),
              ...(output !== undefined ? { output } : {}),
              ...(costUsd !== undefined ? { costUsd } : {}),
              ...(evt.isOk ? {} : { error: errorMessage(evt.error) }),
            },
            "recordStep(NODE_END)",
          );
          break;
        }
        case "WORKFLOW_END": {
          const evt = event as WorkflowEndEventLike;
          if (!evt.isOk && isApprovalPending(evt.error)) {
            // Approval node parked the run — awaiting_approval, not failed.
            // The approvals lib already set the session status; do nothing.
            break;
          }
          if (evt.isOk) {
            // #2: the output node's NODE_END can land after WORKFLOW_END (or
            // not flip its step) — sweep any still-'running' steps to
            // 'completed' so the final step is never stuck. #3: roll the real
            // per-step cost sum into agent_session.cost_so_far. The rollup must
            // see every step write, so it waits for the in-flight node writes
            // (snapshot of `pending`) to settle first.
            const priorWrites = Promise.allSettled([...pending]);
            fireAndForget(
              priorWrites
                .then(() => completeRunningSteps(sessionId))
                .then(() => sumStepCost(sessionId))
                .then((costSoFar) => completeSession(sessionId, { costSoFar })),
              "completeSession(rollup)",
            );
          } else {
            fireAndForget(
              failSession(sessionId, errorMessage(evt.error)),
              "failSession",
            );
          }
          break;
        }
        default:
          // NODE_STREAM and unknown events are intentionally not persisted.
          break;
      }
    } catch (error) {
      // Synchronous safety net — the run must never see persistence errors.
      logger.error("session persistence handler failed:", error);
    }
  };

  executor.subscribe(handler);

  const handle = (() => {
    try {
      executor.unsubscribe?.(handler);
    } catch (error) {
      logger.error("session persistence detach failed:", error);
    }
  }) as SessionPersistenceHandle;

  // Drain every fire-and-forget write — including chained ones enqueued while
  // earlier writes resolve (the WORKFLOW_END rollup waits on prior writes) —
  // by settling repeatedly until no new writes appear.
  handle.flush = async () => {
    while (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }
  };

  return handle;
}
