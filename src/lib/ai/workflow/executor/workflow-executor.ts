import { DBEdge, DBNode } from "app-types/workflow";
import { ConsolaInstance } from "consola";
import { colorize } from "consola/utils";
import { toAny } from "lib/utils";
import globalLogger from "logger";
import { StateGraphRegistry, createStateGraph, graphNode } from "ts-edge";
import { convertDBNodeToUINode } from "../shared.workflow";
import { NodeKind } from "../workflow.interface";
import { addEdgeBranchLabel } from "./add-edge-branch-label";
import {
  WORKFLOW_CONTEXT_KEY,
  type WorkflowExecutorContext,
} from "./executor-context";
import { WorkflowRuntimeState, createGraphStore } from "./graph-store";
import {
  NodeExecutor,
  approvalNodeExecutor,
  conditionNodeExecutor,
  httpNodeExecutor,
  inputNodeExecutor,
  knowledgeNodeExecutor,
  llmNodeExecutor,
  outputNodeExecutor,
  templateNodeExecutor,
  toolNodeExecutor,
} from "./node-executor";

/**
 * Maps node kinds to their corresponding executor functions.
 * When adding a new node type, add its executor here.
 */
function getExecutorByKind(kind: NodeKind): NodeExecutor {
  switch (kind) {
    case NodeKind.Input:
      return inputNodeExecutor;
    case NodeKind.Output:
      return outputNodeExecutor;
    case NodeKind.LLM:
      return llmNodeExecutor;
    case NodeKind.Condition:
      return conditionNodeExecutor;
    case NodeKind.Tool:
      return toolNodeExecutor;
    case NodeKind.Http:
      return httpNodeExecutor;
    case NodeKind.Template:
      return templateNodeExecutor;
    case NodeKind.Knowledge:
      return knowledgeNodeExecutor;
    case NodeKind.Approval:
      return approvalNodeExecutor;
    case "NOOP" as any:
      return () => {
        return {
          input: {},
          output: {},
        };
      };
  }
  return () => {
    console.warn(`Undefined '${kind}' Node Executor`);
    return {};
  };
}

/**
 * Creates a workflow executor that can run a complete workflow.
 * The executor manages:
 * - Node execution order based on dependencies
 * - Data flow between nodes
 * - Error handling and logging
 * - Branch synchronization for condition nodes
 *
 * @param workflow - Contains nodes and edges defining the workflow structure
 * @returns Compiled workflow executor ready to run
 */
export const createWorkflowExecutor = (workflow: {
  nodes: DBNode[];
  edges: DBEdge[];
  logger?: ConsolaInstance;
  /**
   * Agent Platform #24: id of the agent_session governing this run.
   * Required for Approval nodes (they park this session); optional otherwise.
   */
  agentSessionId?: string;
  /**
   * W7 guardrails (ADR-0008): invoking user + team guardrail posture. LLM
   * nodes scan resolved prompts/outputs with this policy (org default when
   * absent) and audit-log firings against the user id.
   */
  userId?: string;
  guardrailPolicy?: string;
  /**
   * Budget/entitlement attribution (ADR-0003/ADR-0009): the executing user's
   * team + resolved effective model allow-list, injected by the caller
   * (execute route / detached worker). LLM/tool nodes confine `node.model` to
   * this list and record usage against userId+teamId. Absent → unrestricted /
   * no attribution.
   */
  teamId?: string | null;
  effectiveModelAllowList?: string[] | null;
  /**
   * Agent Platform #24 — resume seed. On an approval resume the worker passes
   * the already-completed nodes' outputs so they are NOT re-executed
   * (graph-store seeds `outputs`, the execute wrapper skips seeded nodes).
   */
  initialOutputs?: { [nodeId: string]: any };
}) => {
  // Create runtime state store for the workflow
  const store = createGraphStore({
    nodes: workflow.nodes,
    edges: workflow.edges,
    agentSessionId: workflow.agentSessionId,
    userId: workflow.userId,
    guardrailPolicy: workflow.guardrailPolicy,
    teamId: workflow.teamId,
    effectiveModelAllowList: workflow.effectiveModelAllowList,
    initialOutputs: workflow.initialOutputs,
  });

  // Node ids whose output is seeded from a prior run (#24 resume): these are
  // already-completed and must be SKIPPED, not re-executed (no duplicate LLM
  // cost / side effects). A pure pass-through still lets downstream nodes read
  // the seeded `outputs[nodeId]`.
  const seededNodeIds = new Set(Object.keys(workflow.initialOutputs ?? {}));

  const logger =
    workflow.logger ??
    globalLogger.withDefaults({
      message: colorize("cyan", `Workflow Executor:`),
    });

  // Create mapping for node ID to name for logging
  const nodeNameByNodeId = new Map<string, string>(
    workflow.nodes.map((node) => [node.id, node.name]),
  );

  // Create the execution graph using ts-edge library
  const graph = createStateGraph(store) as StateGraphRegistry<
    WorkflowRuntimeState,
    string
  >;

  // Add branch labels for condition node edges
  addEdgeBranchLabel(workflow.nodes, workflow.edges);

  /**
   * Special SKIP node used to handle excess branches from condition nodes.
   * When multiple branches try to execute the same target node,
   * excess executions are routed here to prevent duplicate execution.
   */
  const skipNode = graphNode({
    /*  Identification  */
    name: "SKIP", // All "bypass / terminate" tokens land here
    metadata: {
      description: "Noop sink node used to silently terminate excess branches",
    },
    execute() {
      logger.debug("Noop sink node used to silently terminate excess branches");
    },
  });

  graph.addNode(skipNode);

  // Add all workflow nodes to the execution graph
  workflow.nodes.forEach((node) => {
    graph.addNode({
      name: node.id,
      metadata: {
        kind: node.kind,
      },
      async execute(state) {
        // #24 resume: a node whose output was seeded from a prior run is
        // already done — skip re-execution (avoids duplicate LLM cost / side
        // effects). Its `outputs[nodeId]` is already in the store for
        // downstream nodes to read.
        if (seededNodeIds.has(node.id)) {
          logger.debug(`[RESUME] skipping already-completed node ${node.name}`);
          return;
        }

        // Get the appropriate executor for this node type
        const executor = getExecutorByKind(node.kind as NodeKind);

        // Execute the node with current state
        const result = await executor({
          node: convertDBNodeToUINode(node).data,
          state,
        });

        // Store the execution results in the workflow state
        if (result?.output) {
          state.setOutput(
            {
              nodeId: node.id,
              path: [],
            },
            result.output,
          );
        }
        if (result?.input) {
          state.setInput(node.id, result.input);
        }
      },
    });

    // Handle edges differently for condition nodes vs regular nodes
    if (node.kind === NodeKind.Condition) {
      // Condition nodes use dynamic edges based on their evaluation result
      graph.dynamicEdge(node.id, (state) => {
        const next = state.getOutput({
          nodeId: node.id,
          path: ["nextNodes"],
        }) as DBNode[];
        if (!next?.length) return;
        return next.map((node) => node.id);
      });
    } else {
      // Regular nodes have static edges defined in the workflow
      const targetEdges = workflow.edges
        .filter((edge) => edge.source == node.id)
        .map((v) => v.target);

      if (targetEdges.length) toAny(graph.edge)(node.id, targetEdges);
    }
  });

  // Build table to track how many branches need to reach each node
  // Used to prevent duplicate execution when multiple condition branches
  // converge on the same target node
  let needTable: Record<string, number> = buildNeedTable(workflow.edges);

  // Compile the graph starting from the Input node
  const app = graph
    .compile(workflow.nodes.find((node) => node.kind == NodeKind.Input)!.id)
    .use(async ({ name: nodeId, input }, next) => {
      // Check if this node is expecting multiple incoming branches
      if (!(nodeId in needTable)) return;

      // Decrement the counter - only execute when all branches have arrived
      const left = --needTable[nodeId];
      if (left > 0) return next({ name: "SKIP", input });

      // All branches have arrived, clean up and continue execution
      delete needTable[nodeId];
      return next();
    });

  // Set up event logging for workflow execution monitoring
  app.subscribe((event) => {
    if (event.eventType == "WORKFLOW_START") {
      needTable = buildNeedTable(workflow.edges);
      logger.debug(
        `[${event.eventType}] ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`,
      );
    } else if (event.eventType == "WORKFLOW_END") {
      const duration = ((event.endedAt - event.startedAt) / 1000).toFixed(2);
      const color = event.isOk ? "green" : "red";
      logger.debug(
        `[${event.eventType}] ${colorize(color, event.isOk ? "SUCCESS" : "FAILED")} ${duration}s`,
      );
      if (!event.isOk) {
        logger.error(event.error);
      }
    } else if (event.eventType == "NODE_START") {
      logger.debug(
        `[${event.eventType}] ${nodeNameByNodeId.get(event.node.name)}`,
      );
    } else if (event.eventType == "NODE_END") {
      const duration = ((event.endedAt - event.startedAt) / 1000).toFixed(2);
      const color = event.isOk ? "green" : "red";
      logger.debug(
        `[${event.eventType}] ${nodeNameByNodeId.get(event.node.name)} ${colorize(color, event.isOk ? "SUCCESS" : "FAILED")} ${duration}s`,
      );
    }
  });

  // Agent Platform #21: expose the live runtime context so the persistence
  // seam (attachSessionPersistence) can read each node's OWN input/output/cost
  // and kind from the store — the ts-edge NODE_END event's `node.output` is the
  // WHOLE graph state (a quirk of createStateGraph wrapping execute with
  // `.map(() => store.get())`), never the per-node slice. The map is keyed by
  // node id, which is also the ts-edge graph node `name`.
  const nodeKindById = new Map<string, NodeKind>(
    workflow.nodes.map((node) => [node.id, node.kind as NodeKind]),
  );
  const context: WorkflowExecutorContext = {
    getNodeOutput: (nodeId) => store.get().outputs[nodeId],
    getNodeInput: (nodeId) => store.get().inputs[nodeId],
    getNodeCost: (nodeId) => store.get().costByNode[nodeId],
    getNodeKind: (nodeId) => nodeKindById.get(nodeId),
    getAllOutputs: () => store.get().outputs,
  };
  Object.defineProperty(app, WORKFLOW_CONTEXT_KEY, {
    value: context,
    enumerable: false,
    configurable: true,
  });

  return app as typeof app & {
    [WORKFLOW_CONTEXT_KEY]: WorkflowExecutorContext;
  };
};

/**
 * Builds a table tracking how many different branches need to reach each target node.
 * This is used to synchronize execution when multiple condition branches
 * converge on the same target node.
 *
 * @param edges - All edges in the workflow
 * @returns Object mapping node IDs to required branch count
 */
function buildNeedTable(edges: DBEdge[]): Record<string, number> {
  const map = new Map<string, Set<string>>();

  // Group edges by target and track unique branch labels
  edges.forEach((e) => {
    const bid = e.uiConfig.label as string;
    (map.get(e.target) ?? map.set(e.target, new Set()).get(e.target))!.add(bid);
  });

  // Only nodes with multiple incoming branches need synchronization
  const tbl: Record<string, number> = {};
  map.forEach((set, n) => set.size > 1 && (tbl[n] = set.size));
  return tbl;
}
