import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { isApprovalPending } from "lib/agent-platform/approval-error";
import { markSessionAwaitingApproval } from "lib/agent-platform/approvals";
import {
  type SubscribableExecutor,
  attachSessionPersistence,
} from "lib/agent-platform/persistent-executor";
import {
  type WorkflowConfigSnapshot,
  resolveRunnableRevision,
} from "lib/agent-platform/revisions";
import { createSession as createAgentSession } from "lib/agent-platform/sessions";
import { createWorkflowExecutor } from "lib/ai/workflow/executor/workflow-executor";
import { encodeWorkflowEvent } from "lib/ai/workflow/shared.workflow";
import { workflowRepository } from "lib/db/repository";
import { safeJSONParse, toAny } from "lib/utils";
import logger from "logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { query } = await request.json();
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const hasAccess = await workflowRepository.checkAccess(id, session.user.id);
  if (!hasAccess) {
    return new Response("Unauthorized", { status: 401 });
  }
  const workflow = await workflowRepository.selectStructureById(id);
  if (!workflow) {
    return new Response("Workflow not found", { status: 404 });
  }

  const wfLogger = logger.withDefaults({
    message: colorize("cyan", `WORKFLOW '${workflow.name}' `),
  });

  // Agent Platform #19: when this workflow has a published revision, pin it
  // and execute from its frozen configSnapshot (nodes/edges) instead of the
  // live tables — publishing a new version never mutates this run.
  // Strictly best-effort: any resolution failure (or a malformed snapshot)
  // falls back to the live structure, so pre-revision behavior is unchanged.
  let pinnedRevisionId: string | null = null;
  let nodes = workflow.nodes;
  let edges = workflow.edges;
  try {
    const published = await resolveRunnableRevision("workflow", id);
    const snapshot = published?.configSnapshot as
      | Partial<WorkflowConfigSnapshot>
      | null
      | undefined;
    if (
      published &&
      Array.isArray(snapshot?.nodes) &&
      Array.isArray(snapshot?.edges)
    ) {
      pinnedRevisionId = published.id;
      nodes = snapshot.nodes as unknown as typeof workflow.nodes;
      edges = snapshot.edges as unknown as typeof workflow.edges;
    }
  } catch (error) {
    logger.error(
      "Failed to resolve published revision; executing live structure:",
      error,
    );
  }

  // Agent Platform #21: mirror this run into agent_session/agent_step.
  // Strictly best-effort — the route must never fail because of persistence.
  // Created BEFORE the executor so Approval nodes (#24) can read the session
  // id from the workflow runtime state.
  let agentSessionId: string | undefined;
  try {
    const agentSession = await createAgentSession({
      kind: "workflow",
      definitionId: id,
      revisionId: pinnedRevisionId,
      userId: session.user.id,
      originSurface: "web",
      inputPayload: { query },
    });
    agentSessionId = agentSession.id;
  } catch (error) {
    logger.error("Failed to create agent session:", error);
  }

  const app = createWorkflowExecutor({
    edges,
    nodes,
    logger: wfLogger,
    agentSessionId,
  });

  if (agentSessionId) {
    try {
      attachSessionPersistence(
        app as unknown as SubscribableExecutor,
        agentSessionId,
      );
    } catch (error) {
      logger.error("Failed to attach agent session persistence:", error);
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let isAborted = false;
      // Subscribe to workflow events
      app.subscribe((evt) => {
        if (isAborted) return;
        if (
          (evt.eventType == "NODE_START" || evt.eventType == "NODE_END") &&
          evt.node.name == "SKIP"
        ) {
          return;
        }
        try {
          const err = toAny(evt)?.error;
          if (err) {
            toAny(evt).error = {
              name: err.name || "ERROR",
              message: err?.message || safeJSONParse(err).value,
            };
          }
          // Use custom encoding instead of SSE format
          const data = encodeWorkflowEvent(evt);
          controller.enqueue(encoder.encode(data));
          // Close stream when workflow ends
          if (evt.eventType === "WORKFLOW_END") {
            controller.close();
          }
        } catch (error) {
          logger.error("Stream write error:", error);
          controller.error(error);
        }
      });

      // Handle client disconnection
      request.signal.addEventListener("abort", async () => {
        isAborted = true;
        void app.exit();
        controller.close();
      });

      // Start the workflow
      app
        .run(
          { query },
          {
            disableHistory: true,
            timeout: 1000 * 60 * 5,
          },
        )
        .then(async (result) => {
          if (!result.isOk) {
            // Approval gate (#24): an ApprovalPendingError is a pause, not a
            // failure. Re-assert awaiting_approval because the generic
            // WORKFLOW_END persistence path may have raced a failSession in.
            if (isApprovalPending(result.error)) {
              if (agentSessionId) {
                try {
                  await markSessionAwaitingApproval(agentSessionId);
                } catch (error) {
                  logger.error(
                    "Failed to mark session awaiting approval:",
                    error,
                  );
                }
              }
              logger.info(
                `Workflow parked awaiting approval (session ${agentSessionId})`,
              );
              return;
            }
            logger.error("Workflow execution error:", result.error);
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
