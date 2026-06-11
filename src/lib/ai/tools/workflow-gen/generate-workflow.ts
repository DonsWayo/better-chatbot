import { tool as createTool } from "ai";
import { z } from "zod";

import { Edge } from "@xyflow/react";
import { ChatModel } from "app-types/chat";
import { TipTapMentionJsonContent } from "app-types/util";
import { DBEdge, DBNode } from "app-types/workflow";
import { createDraftRevision } from "lib/agent-platform/revisions";
import { createUINode } from "lib/ai/workflow/create-ui-node";
import { allNodeValidate } from "lib/ai/workflow/node-validate";
import {
  convertUIEdgeToDBEdge,
  convertUINodeToDBNode,
} from "lib/ai/workflow/shared.workflow";
import {
  ApprovalNodeData,
  HttpNodeData,
  InputNodeData,
  LLMNodeData,
  NodeKind,
  OutputNodeData,
  TemplateNodeData,
  ToolNodeData,
  UINode,
} from "lib/ai/workflow/workflow.interface";
import { workflowRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";

// Agent Platform #19 — NL workflow generation ("Cowork-lite",
// docs/design/agent-platform.md): the model drafts a graph constrained by a
// zod mirror of the real node vocabulary; it is validated with the same
// node-validate rules as the builder, persisted as a PRIVATE unpublished
// workflow, and snapshotted as a DRAFT revision. The model never publishes.

export const MAX_GENERATED_NODES = 20;
export const MAX_GENERATED_EDGES = 40;

// Frontier-tier default from the cost stack (cost directive 2026-06) — generated
// LLM nodes should not pin a premium, entitlement-only model.
export const DEFAULT_WORKFLOW_LLM_MODEL: ChatModel = {
  provider: "openRouter",
  model: "kimi-k2.5",
};

const textToTiptap = (text: string): TipTapMentionJsonContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ],
});

const nodeBase = {
  name: z
    .string()
    .min(1)
    .max(100)
    .describe("Unique node name within the workflow"),
  description: z.string().optional(),
};

const fieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);

const chatModelSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

const inputNodeSchema = z.object({
  kind: z.literal("input"),
  ...nodeBase,
  fields: z
    .record(z.string(), fieldTypeSchema)
    .optional()
    .describe(
      "Input parameters the workflow accepts (field name -> primitive type)",
    ),
});

const llmNodeSchema = z.object({
  kind: z.literal("llm"),
  ...nodeBase,
  model: chatModelSchema
    .optional()
    .describe("Optional chat model override; a default is used when omitted"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        text: z.string().min(1),
      }),
    )
    .min(1)
    .optional()
    .describe("Prompt messages as plain text; defaults to a user message"),
});

const conditionNodeSchema = z.object({
  kind: z.literal("condition"),
  ...nodeBase,
});

const toolNodeSchema = z.object({
  kind: z.literal("tool"),
  ...nodeBase,
  tool: z
    .object({
      id: z.string().min(1).describe("Tool name to execute"),
      description: z.string(),
    })
    .describe("App tool executed by this node"),
  message: z
    .string()
    .optional()
    .describe("Instruction used to generate the tool parameters"),
});

const httpNodeSchema = z.object({
  kind: z.literal("http"),
  ...nodeBase,
  url: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]).optional(),
  headers: z
    .array(z.object({ key: z.string(), value: z.string().optional() }))
    .optional(),
  query: z
    .array(z.object({ key: z.string(), value: z.string().optional() }))
    .optional(),
  body: z
    .string()
    .optional()
    .describe("Request body; only valid for POST/PUT/PATCH"),
});

const templateNodeSchema = z.object({
  kind: z.literal("template"),
  ...nodeBase,
  template: z.string().optional().describe("Plain-text template content"),
});

const approvalNodeSchema = z.object({
  kind: z.literal("approval"),
  ...nodeBase,
  requestedRole: z.enum(["owner", "team-admin", "admin"]).optional(),
  message: z
    .string()
    .optional()
    .describe("Shown to the approver alongside the payload"),
});

const outputNodeSchema = z.object({
  kind: z.literal("output"),
  ...nodeBase,
  outputData: z
    .array(
      z.object({
        key: z.string().min(1),
        source: z.object({
          nodeName: z
            .string()
            .describe("Name of the node whose output is referenced"),
          path: z
            .array(z.string())
            .min(1)
            .describe(
              'Path into the source node output schema, e.g. ["answer"] for LLM nodes or ["response","body"] for HTTP nodes',
            ),
        }),
      }),
    )
    .optional(),
});

const generatedNodeSchema = z.discriminatedUnion("kind", [
  inputNodeSchema,
  llmNodeSchema,
  conditionNodeSchema,
  toolNodeSchema,
  httpNodeSchema,
  templateNodeSchema,
  approvalNodeSchema,
  outputNodeSchema,
]);

export type GeneratedNodeSpec = z.infer<typeof generatedNodeSchema>;

/**
 * Workflow names are exposed verbatim as chat tool names, so they must be
 * alphanumeric-with-hyphens. Models routinely propose human titles ("Check
 * safeguru.com is up") — slugify instead of failing the whole generation.
 */
export function slugifyWorkflowName(raw: string): string {
  const slug = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "generated-workflow";
}

/**
 * Weaker models sometimes emit each node as a JSON-*string* instead of an
 * object (discriminated unions translate poorly to their tool-call JSON
 * schema). Parse those instead of failing with "expected object, received
 * string" loops.
 */
const coercedNodeSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}, generatedNodeSchema);

export const generateWorkflowInputSchema = z.object({
  name: z.string().min(1).max(120).transform(slugifyWorkflowName),
  description: z.string(),
  nodes: z.preprocess((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }, z
    .array(coercedNodeSchema)
    .min(2)
    .max(MAX_GENERATED_NODES)
    .describe(
      "Workflow graph nodes. Exactly one input node and at least one output node are required.",
    )),
  edges: z
    .array(
      z.object({
        source: z.string().describe("Source node name"),
        target: z.string().describe("Target node name"),
        sourceHandle: z
          .string()
          .optional()
          .describe('Branch handle for condition nodes ("if" / "else")'),
      }),
    )
    .max(MAX_GENERATED_EDGES),
});

export type GenerateWorkflowInput = z.infer<typeof generateWorkflowInputSchema>;

export type GenerateWorkflowIssue = {
  node?: string;
  message: string;
};

export type GenerateWorkflowResult =
  | {
      ok: true;
      workflowId: string;
      revisionId: string;
      name: string;
      nodeCount: number;
      edgeCount: number;
      builderUrl: string;
    }
  | {
      ok: false;
      issues: GenerateWorkflowIssue[];
    };

const KIND_BY_SPEC: Record<GeneratedNodeSpec["kind"], NodeKind> = {
  input: NodeKind.Input,
  llm: NodeKind.LLM,
  condition: NodeKind.Condition,
  tool: NodeKind.Tool,
  http: NodeKind.Http,
  template: NodeKind.Template,
  approval: NodeKind.Approval,
  output: NodeKind.Output,
};

const NODE_X_GAP = 360;

/**
 * Build a UINode for one model-provided spec by merging its minimal config
 * over the create-ui-node defaults (imported, not duplicated).
 */
function buildUINode(
  spec: GeneratedNodeSpec,
  index: number,
  nameToId: Record<string, string>,
  issues: GenerateWorkflowIssue[],
): UINode {
  const node = createUINode(KIND_BY_SPEC[spec.kind], {
    id: nameToId[spec.name],
    name: spec.name,
    position: { x: index * NODE_X_GAP, y: 0 },
  });
  if (spec.description) node.data.description = spec.description;

  switch (spec.kind) {
    case "input": {
      const data = node.data as InputNodeData;
      if (spec.fields) {
        data.outputSchema.properties = Object.fromEntries(
          Object.entries(spec.fields).map(([key, type]) => [key, { type }]),
        );
      }
      break;
    }
    case "llm": {
      const data = node.data as LLMNodeData;
      data.model = spec.model ?? structuredClone(DEFAULT_WORKFLOW_LLM_MODEL);
      const messages = spec.messages ?? [
        {
          role: "user" as const,
          text: spec.description || `Process the input for ${spec.name}.`,
        },
      ];
      data.messages = messages.map((m) => ({
        role: m.role,
        content: textToTiptap(m.text),
      }));
      break;
    }
    case "condition":
      // create-ui-node default if/else branches are already minimal-but-valid
      break;
    case "tool": {
      const data = node.data as ToolNodeData;
      data.tool = {
        id: spec.tool.id,
        description: spec.tool.description,
        type: "app-tool",
      };
      data.model = structuredClone(DEFAULT_WORKFLOW_LLM_MODEL);
      data.message = textToTiptap(
        spec.message || spec.description || `Run ${spec.tool.id}.`,
      );
      break;
    }
    case "http": {
      const data = node.data as HttpNodeData;
      data.url = spec.url;
      if (spec.method) data.method = spec.method;
      if (spec.headers) data.headers = spec.headers;
      if (spec.query) data.query = spec.query;
      // Models routinely attach a body to GET/HEAD/DELETE requests; the builder's
      // node-validate rejects that outright. Drop the body instead of failing the
      // whole generation (same self-healing philosophy as slugifyWorkflowName).
      const bodyAllowed = ["POST", "PUT", "PATCH"].includes(
        spec.method ?? "GET",
      );
      if (spec.body !== undefined && bodyAllowed) data.body = spec.body;
      break;
    }
    case "template": {
      const data = node.data as TemplateNodeData;
      if (spec.template !== undefined) {
        data.template = {
          type: "tiptap",
          tiptap: textToTiptap(spec.template),
        };
      }
      break;
    }
    case "approval": {
      const data = node.data as ApprovalNodeData;
      if (spec.requestedRole) data.requestedRole = spec.requestedRole;
      if (spec.message !== undefined) data.message = spec.message;
      break;
    }
    case "output": {
      const data = node.data as OutputNodeData;
      data.outputData = (spec.outputData ?? []).map((entry) => {
        const sourceId = nameToId[entry.source.nodeName];
        if (!sourceId) {
          issues.push({
            node: spec.name,
            message: `Output source references unknown node name "${entry.source.nodeName}"`,
          });
        }
        return {
          key: entry.key,
          source: { nodeId: sourceId, path: entry.source.path },
        };
      });
      break;
    }
  }

  return node;
}

/**
 * Pure draft-graph builder: structural guardrails + create-ui-node default
 * merge + node-validate. Returns either the validated graph or the issue
 * list (so the calling model can self-correct and retry). Never persists.
 */
export function buildDraftGraph(input: GenerateWorkflowInput):
  | {
      ok: true;
      nodes: UINode[];
      edges: Edge[];
    }
  | { ok: false; issues: GenerateWorkflowIssue[] } {
  const issues: GenerateWorkflowIssue[] = [];

  // Guardrails (defense in depth on top of the zod caps)
  if (input.nodes.length > MAX_GENERATED_NODES) {
    issues.push({
      message: `Too many nodes: ${input.nodes.length} (max ${MAX_GENERATED_NODES})`,
    });
  }
  if (input.edges.length > MAX_GENERATED_EDGES) {
    issues.push({
      message: `Too many edges: ${input.edges.length} (max ${MAX_GENERATED_EDGES})`,
    });
  }

  const names = input.nodes.map((n) => n.name);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  for (const name of new Set(duplicates)) {
    issues.push({ node: name, message: `Duplicate node name "${name}"` });
  }

  const inputCount = input.nodes.filter((n) => n.kind === "input").length;
  if (inputCount !== 1) {
    issues.push({
      message: `Workflow must have exactly one input node (found ${inputCount})`,
    });
  }
  const outputCount = input.nodes.filter((n) => n.kind === "output").length;
  if (outputCount < 1) {
    issues.push({ message: "Workflow must have at least one output node" });
  }

  const nameToId: Record<string, string> = {};
  for (const name of names) {
    nameToId[name] ??= generateUUID();
  }

  for (const edge of input.edges) {
    if (!nameToId[edge.source]) {
      issues.push({
        message: `Edge references unknown source node "${edge.source}"`,
      });
    }
    if (!nameToId[edge.target]) {
      issues.push({
        message: `Edge references unknown target node "${edge.target}"`,
      });
    }
  }

  if (issues.length) return { ok: false, issues };

  const nodes = input.nodes.map((spec, index) =>
    buildUINode(spec, index, nameToId, issues),
  );
  const edges: Edge[] = input.edges.map((edge) => ({
    id: generateUUID(),
    source: nameToId[edge.source],
    target: nameToId[edge.target],
    sourceHandle: edge.sourceHandle,
  }));

  if (issues.length) return { ok: false, issues };

  // Same validation the builder runs before saving (node-validate.ts)
  const validation = allNodeValidate({ nodes, edges });
  if (validation !== true) {
    return {
      ok: false,
      issues: [
        {
          node: validation.node?.data.name,
          message: validation.errorMessage,
        },
      ],
    };
  }

  return { ok: true, nodes, edges };
}

export const generateWorkflowToolDescription = `Generate a DRAFT workflow from a natural-language plan.
Builds a node graph (input/llm/condition/tool/http/template/approval/output), validates it with the workflow builder rules, and saves it as a private, unpublished draft owned by the current user. Reference nodes by their unique "name" in edges and output sources. The graph must contain exactly one input node and at least one output node, and every output node must be reachable from the input node through edges. LLM node outputs are read via path ["answer"]; HTTP node outputs via path ["response","body"]. On failure the result contains "issues" — fix them and call the tool again. The draft is never published automatically.`;

/**
 * App-default chat tool factory. userId is bound at tool-load time (the chat
 * route resolves the session and threads it through loadAppDefaultTools),
 * so the model can never choose the owner.
 */
export const createGenerateWorkflowTool = (ctx: { userId: string }) =>
  createTool({
    description: generateWorkflowToolDescription,
    inputSchema: generateWorkflowInputSchema,
    execute: async (input): Promise<GenerateWorkflowResult> => {
      const graph = buildDraftGraph(input);
      if (!graph.ok) return graph;

      try {
        // Draft only: private, unpublished, owned by the chat user.
        const workflow = await workflowRepository.save(
          {
            name: input.name,
            description: input.description,
            visibility: "private",
            isPublished: false,
            userId: ctx.userId,
          },
          true, // we provide our own input node
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

        const revision = await createDraftRevision({
          kind: "workflow",
          sourceId: workflow.id,
          authorId: ctx.userId,
          changelog: "Generated from chat",
        });

        return {
          ok: true,
          workflowId: workflow.id,
          revisionId: revision.id,
          name: workflow.name,
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          builderUrl: `/workflow/${workflow.id}`,
        };
      } catch (error) {
        return {
          ok: false,
          issues: [
            {
              message: `Failed to persist draft workflow: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    },
  });
