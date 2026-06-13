import { NodeKind } from "../workflow.interface";

/**
 * Agent Platform #21 — the live per-node accessor attached to a workflow
 * executor under {@link WORKFLOW_CONTEXT_KEY}. Lets the persistence seam
 * (attachSessionPersistence) pull a node's OWN input/output/cost/kind from the
 * runtime store instead of the whole-graph blob carried on the ts-edge
 * NODE_END event (createStateGraph wraps each node's execute with
 * `.map(() => store.get())`, so the event's node.output is the entire state).
 *
 * Kept dependency-free (no server-only / DB / ts-edge imports) so both the
 * executor and the persistence layer can share it without pulling each other's
 * heavy graphs.
 */
export interface WorkflowExecutorContext {
  getNodeOutput(nodeId: string): unknown;
  getNodeInput(nodeId: string): unknown;
  getNodeCost(nodeId: string): number | undefined;
  getNodeKind(nodeId: string): NodeKind | undefined;
  getAllOutputs(): { [nodeId: string]: unknown };
}

/** Non-enumerable property key carrying {@link WorkflowExecutorContext}. */
export const WORKFLOW_CONTEXT_KEY = "__asafeWorkflowContext" as const;

/** Reads the {@link WorkflowExecutorContext} off an executor, if present. */
export function getWorkflowExecutorContext(
  app: unknown,
): WorkflowExecutorContext | undefined {
  if (app && typeof app === "object" && WORKFLOW_CONTEXT_KEY in app) {
    return (app as Record<string, unknown>)[
      WORKFLOW_CONTEXT_KEY
    ] as WorkflowExecutorContext;
  }
  return undefined;
}
