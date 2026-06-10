import "server-only";

import { Edge } from "@xyflow/react";
import { ChatModel } from "app-types/chat";
import { TipTapMentionJsonContent } from "app-types/util";
import { DBEdge, DBNode } from "app-types/workflow";
import {
  createSchedule,
  listSchedulesForUser,
  setScheduleEnabled,
} from "lib/agent-platform/scheduler";
import { createUINode } from "lib/ai/workflow/create-ui-node";
import { allNodeValidate } from "lib/ai/workflow/node-validate";
import {
  convertUIEdgeToDBEdge,
  convertUINodeToDBNode,
} from "lib/ai/workflow/shared.workflow";
import {
  InputNodeData,
  LLMNodeData,
  NodeKind,
  OutputNodeData,
  UINode,
} from "lib/ai/workflow/workflow.interface";
import { agentRepository, workflowRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";
import { RolePackWorkflowDef, getRolePack } from "./packs";

// Role-pack installer. Idempotent per owner: an item (agent / workflow /
// schedule) is skipped when the owner already has one with the same name —
// re-running an install never duplicates content. Installed content is
// company-visible (visibility stores the literal value since migration 0041);
// the hero routine is created and then immediately disabled so nothing runs
// until an admin explicitly enables it.

/** Default model for pack workflow LLM nodes (same as NL workflow gen). */
export const ROLE_PACK_WORKFLOW_MODEL: ChatModel = {
  provider: "openRouter",
  model: "gpt-5.1",
};

const NODE_X_GAP = 360;

export interface InstallRolePackResult {
  /** Labels of items created by this run, e.g. "agent:Proposal Drafter". */
  created: string[];
  /** Labels of items skipped because they already existed for this owner. */
  skipped: string[];
}

export type RolePackItemStatus = {
  kind: "agent" | "workflow" | "schedule";
  name: string;
  installed: boolean;
};

export interface RolePackStatus {
  packId: string;
  items: RolePackItemStatus[];
  /** True when every item of the pack already exists for this owner. */
  installed: boolean;
}

type TipTapParagraph = TipTapMentionJsonContent["content"][number];

const textParagraph = (text: string): TipTapParagraph => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

/**
 * Builds the LLM user message: the pack prompt as paragraphs, followed by
 * one labelled mention per input field so the run payload reaches the model
 * (mentions resolve to node output values at execution time).
 */
function buildLLMMessageContent(
  def: RolePackWorkflowDef,
  inputNodeId: string,
): TipTapMentionJsonContent {
  const paragraphs: TipTapParagraph[] = def.llm.prompt
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map(textParagraph);

  for (const [field, { label }] of Object.entries(def.inputFields)) {
    paragraphs.push({
      type: "paragraph",
      content: [
        { type: "text", text: `${label}: ` },
        {
          type: "mention",
          attrs: {
            id: generateUUID(),
            label: JSON.stringify({ nodeId: inputNodeId, path: [field] }),
          },
        },
      ],
    });
  }

  return { type: "doc", content: paragraphs };
}

/**
 * Builds the canonical pack graph: INPUT → LLM → OUTPUT, validated with the
 * same node-validate rules the workflow builder runs before saving.
 */
export function buildPackWorkflowGraph(def: RolePackWorkflowDef): {
  nodes: UINode[];
  edges: Edge[];
} {
  const inputId = generateUUID();
  const llmId = generateUUID();
  const outputId = generateUUID();

  const input = createUINode(NodeKind.Input, {
    id: inputId,
    name: "INPUT",
    position: { x: 0, y: 0 },
  });
  (input.data as InputNodeData).outputSchema.properties = Object.fromEntries(
    Object.entries(def.inputFields).map(([key, field]) => [
      key,
      { type: field.type },
    ]),
  );

  const llm = createUINode(NodeKind.LLM, {
    id: llmId,
    name: def.llm.name,
    position: { x: NODE_X_GAP, y: 0 },
  });
  const llmData = llm.data as LLMNodeData;
  llmData.description = def.description;
  llmData.model = { ...ROLE_PACK_WORKFLOW_MODEL };
  llmData.messages = [
    { role: "user", content: buildLLMMessageContent(def, inputId) },
  ];

  const output = createUINode(NodeKind.Output, {
    id: outputId,
    name: "OUTPUT",
    position: { x: NODE_X_GAP * 2, y: 0 },
  });
  (output.data as OutputNodeData).outputData = [
    { key: def.outputKey, source: { nodeId: llmId, path: ["answer"] } },
  ];

  const nodes = [input, llm, output];
  const edges: Edge[] = [
    { id: generateUUID(), source: inputId, target: llmId },
    { id: generateUUID(), source: llmId, target: outputId },
  ];

  const validation = allNodeValidate({ nodes, edges });
  if (validation !== true) {
    throw new Error(
      `Role pack workflow "${def.name}" failed validation: ${validation.errorMessage}`,
    );
  }

  return { nodes, edges };
}

/**
 * Installs a role pack for the given admin owner. Idempotent: items whose
 * name already exists for that owner are skipped, so re-running after a
 * partial install only fills in the missing pieces.
 */
export async function installRolePack(
  packId: string,
  adminUserId: string,
): Promise<InstallRolePackResult> {
  const pack = getRolePack(packId);
  if (!pack) {
    throw new Error(`Unknown role pack: ${packId}`);
  }

  const created: string[] = [];
  const skipped: string[] = [];

  // Agents — skip by owner + name.
  const existingAgents =
    await agentRepository.selectAgentsByUserId(adminUserId);
  const existingAgentNames = new Set(existingAgents.map((a) => a.name));

  for (const agentDef of pack.agents) {
    if (existingAgentNames.has(agentDef.name)) {
      skipped.push(`agent:${agentDef.name}`);
      continue;
    }
    await agentRepository.insertAgent({
      name: agentDef.name,
      description: agentDef.description,
      icon: agentDef.icon,
      userId: adminUserId,
      instructions: {
        role: agentDef.instructions.role,
        systemPrompt: agentDef.instructions.systemPrompt,
      },
      visibility: "company",
    });
    created.push(`agent:${agentDef.name}`);
  }

  // Workflow — skip by owner + name, but keep the existing id so a missing
  // schedule can still be attached on a re-run.
  const existingWorkflows =
    await workflowRepository.selectByUserId(adminUserId);
  const existingWorkflow = existingWorkflows.find(
    (w) => w.name === pack.workflow.name,
  );

  let workflowId: string;
  if (existingWorkflow) {
    skipped.push(`workflow:${pack.workflow.name}`);
    workflowId = existingWorkflow.id;
  } else {
    const graph = buildPackWorkflowGraph(pack.workflow);
    const workflow = await workflowRepository.save(
      {
        name: pack.workflow.name,
        description: pack.workflow.description,
        icon: pack.workflow.icon,
        visibility: "company",
        isPublished: true,
        userId: adminUserId,
      },
      true, // the graph provides its own input node
    );
    await workflowRepository.saveStructure({
      workflowId: workflow.id,
      nodes: graph.nodes.map((node) =>
        convertUINodeToDBNode(workflow.id, node),
      ) as DBNode[],
      edges: graph.edges.map((edge) =>
        convertUIEdgeToDBEdge(workflow.id, edge),
      ) as DBEdge[],
    });
    workflowId = workflow.id;
    created.push(`workflow:${pack.workflow.name}`);
  }

  // Hero routine — skip when this owner already has a schedule on the pack
  // workflow. New schedules are disabled immediately after creation: a pack
  // install must never start running anything on its own.
  const existingSchedules = await listSchedulesForUser(adminUserId);
  if (existingSchedules.some((s) => s.workflowId === workflowId)) {
    skipped.push(`schedule:${pack.schedule.label}`);
  } else {
    const schedule = await createSchedule({
      workflowId,
      cronExpr: pack.schedule.cronExpr,
      timezone: pack.schedule.timezone,
      inputTemplate: pack.schedule.inputTemplate,
      createdBy: adminUserId,
    });
    await setScheduleEnabled(schedule.id, false);
    created.push(`schedule:${pack.schedule.label}`);
  }

  return { created, skipped };
}

/**
 * Per-item installed state for a pack, using the same owner + name matching
 * the installer skips on (so "installed" always equals "install would skip").
 */
export async function getRolePackStatus(
  packId: string,
  userId: string,
): Promise<RolePackStatus> {
  const pack = getRolePack(packId);
  if (!pack) {
    throw new Error(`Unknown role pack: ${packId}`);
  }

  const [agents, workflows, schedules] = await Promise.all([
    agentRepository.selectAgentsByUserId(userId),
    workflowRepository.selectByUserId(userId),
    listSchedulesForUser(userId),
  ]);

  const agentNames = new Set(agents.map((a) => a.name));
  const workflow = workflows.find((w) => w.name === pack.workflow.name);

  const items: RolePackItemStatus[] = [
    ...pack.agents.map((a) => ({
      kind: "agent" as const,
      name: a.name,
      installed: agentNames.has(a.name),
    })),
    {
      kind: "workflow" as const,
      name: pack.workflow.name,
      installed: !!workflow,
    },
    {
      kind: "schedule" as const,
      name: pack.schedule.label,
      installed:
        !!workflow && schedules.some((s) => s.workflowId === workflow.id),
    },
  ];

  return {
    packId: pack.id,
    items,
    installed: items.every((item) => item.installed),
  };
}
