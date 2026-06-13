import { ObjectJsonSchema7 } from "app-types/util";
import { DBEdge, DBNode } from "app-types/workflow";
import { objectFlow, toAny } from "lib/utils";
import { graphStore } from "ts-edge";
import { defaultObjectJsonSchema } from "../shared.workflow";
import { OutputSchemaSourceKey } from "../workflow.interface";

export interface WorkflowRuntimeState {
  query: Record<string, unknown>;
  /**
   * Agent Platform #24: id of the agent_session governing this run, injected
   * by the caller (execute route / detached worker). Approval nodes require
   * it to park the session; absent for ungoverned runs.
   */
  agentSessionId?: string;
  /**
   * W7 guardrails (ADR-0008): identity + posture of the invoking principal,
   * injected by the caller (execute route / chat tool binding / worker).
   * LLM nodes scan their resolved prompts/outputs with `guardrailPolicy`
   * (org default when absent) and audit firings against `userId`.
   */
  userId?: string;
  guardrailPolicy?: string;
  /**
   * Budget/entitlement attribution (ADR-0003/ADR-0009): the executing user's
   * team and resolved effective model allow-list, injected by the caller
   * (execute route / worker). LLM and tool nodes:
   *   - confine `node.model` to `effectiveModelAllowList` (substitute the
   *     routed/fallback model when a node names a model the user can't use);
   *   - record usage against `userId`+`teamId` after every provider call.
   * `effectiveModelAllowList === null/undefined` means unrestricted.
   */
  teamId?: string | null;
  effectiveModelAllowList?: string[] | null;
  inputs: {
    [nodeId: string]: any;
  };
  nodes: DBNode[];
  edges: DBEdge[];
  outputs: {
    [nodeId: string]: any;
  };
  /**
   * Agent Platform #21/#24 — per-node USD cost accumulator. LLM/tool nodes
   * add the priced cost of each provider call here (keyed by node id) so the
   * persistence layer can stamp agent_step.cost_usd per node and roll the sum
   * into agent_session.cost_so_far. Empty for nodes that burn no tokens.
   */
  costByNode: {
    [nodeId: string]: number;
  };
  setInput(nodeId: string, value: any): void;
  getInput(nodeId: string): any;
  setOutput(key: OutputSchemaSourceKey, value: any): void;
  getOutput<T>(key: OutputSchemaSourceKey): undefined | T;
  /** Accumulate USD cost for `nodeId` (summed across calls within the node). */
  addCost(nodeId: string, costUsd: number): void;
}

export const createGraphStore = (params: {
  nodes: DBNode[];
  edges: DBEdge[];
  agentSessionId?: string;
  userId?: string;
  guardrailPolicy?: string;
  teamId?: string | null;
  effectiveModelAllowList?: string[] | null;
  /**
   * Agent Platform #24 — resume seed. On an approval resume the worker reloads
   * the outputs of already-completed nodes here so downstream nodes see prior
   * results without re-executing the upstream graph (idempotent re-run). Empty
   * for a fresh run.
   */
  initialOutputs?: { [nodeId: string]: any };
}) => {
  return graphStore<WorkflowRuntimeState>((set, get) => {
    return {
      query: {},
      agentSessionId: params.agentSessionId,
      userId: params.userId,
      guardrailPolicy: params.guardrailPolicy,
      teamId: params.teamId,
      effectiveModelAllowList: params.effectiveModelAllowList,
      outputs: { ...(params.initialOutputs ?? {}) },
      inputs: {},
      costByNode: {},
      nodes: params.nodes,
      edges: params.edges,
      addCost(nodeId, costUsd) {
        if (!costUsd) return;
        set((prev) => ({
          costByNode: {
            ...prev.costByNode,
            [nodeId]: (prev.costByNode[nodeId] ?? 0) + costUsd,
          },
        }));
      },
      setInput(nodeId, value) {
        set((prev) => {
          return { inputs: { ...prev.inputs, [nodeId]: value } };
        });
      },
      getInput(nodeId) {
        const { inputs } = get();
        return inputs[nodeId];
      },
      setOutput(key, value) {
        set((prev) => {
          const next = objectFlow(prev.outputs).setByPath(
            [key.nodeId, ...key.path],
            value,
          );
          return {
            outputs: next,
          };
        });
      },
      getOutput(key) {
        const { outputs, nodes } = get();
        const targetNode = nodes.find((n) => n.id == key.nodeId);
        const schema =
          (targetNode?.nodeConfig?.outputSchema as ObjectJsonSchema7) ??
          defaultObjectJsonSchema;
        const defaultValue = key.path.length
          ? key.path.reduce(
              (acc, cur, index) => {
                const isLast = index === key.path.length - 1;
                if (isLast) return acc?.[cur]?.default;
                return acc?.[cur]?.properties?.[cur];
              },
              (schema.properties ?? {}) as any,
            )
          : toAny(schema)?.default;

        return (
          objectFlow(outputs[key.nodeId]).getByPath(key.path) ?? defaultValue
        );
      },
    };
  });
};
