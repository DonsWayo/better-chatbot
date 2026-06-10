import "server-only";

import globalLogger from "logger";
import {
  completeSession,
  failSession,
  recordStep,
  startSession,
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

/** Swallow + log: persistence must never break a live run. */
function fireAndForget(promise: Promise<unknown>, context: string): void {
  promise.catch((error) => {
    logger.error(`${context} failed:`, error);
  });
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
): () => void {
  let nextStepIndex = 0;
  // NODE_END must land on the same stepIndex its NODE_START created; key by
  // nodeExecutionId when available (parallel branches), node name otherwise.
  const stepIndexByExecution = new Map<string, number>();

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
          const stepIndex = nextStepIndex++;
          stepIndexByExecution.set(
            evt.nodeExecutionId ?? evt.node.name,
            stepIndex,
          );
          fireAndForget(touchHeartbeat(sessionId), "touchHeartbeat");
          fireAndForget(
            recordStep(sessionId, {
              nodeId: evt.node.name,
              stepIndex,
              status: "running",
              ...(evt.node.input !== undefined
                ? { input: evt.node.input }
                : {}),
            }),
            "recordStep(NODE_START)",
          );
          break;
        }
        case "NODE_END": {
          const evt = event as NodeEndEventLike;
          if (evt.node.name === SKIP_NODE_NAME) break;
          const key = evt.nodeExecutionId ?? evt.node.name;
          const stepIndex =
            stepIndexByExecution.get(key) ?? Math.max(nextStepIndex - 1, 0);
          stepIndexByExecution.delete(key);
          fireAndForget(touchHeartbeat(sessionId), "touchHeartbeat");
          fireAndForget(
            recordStep(sessionId, {
              nodeId: evt.node.name,
              stepIndex,
              status: evt.isOk ? "completed" : "failed",
              ...(evt.node.output !== undefined
                ? { output: evt.node.output }
                : {}),
              ...(evt.isOk ? {} : { error: errorMessage(evt.error) }),
            }),
            "recordStep(NODE_END)",
          );
          break;
        }
        case "WORKFLOW_END": {
          const evt = event as WorkflowEndEventLike;
          fireAndForget(
            evt.isOk
              ? completeSession(sessionId)
              : failSession(sessionId, errorMessage(evt.error)),
            evt.isOk ? "completeSession" : "failSession",
          );
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

  return () => {
    try {
      executor.unsubscribe?.(handler);
    } catch (error) {
      logger.error("session persistence detach failed:", error);
    }
  };
}
