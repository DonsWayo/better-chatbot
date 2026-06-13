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
import { aupGateResponse } from "lib/compliance/aup";
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

  // AUP hard gate (EU AI Act Art. 50): executing a workflow runs inference, so
  // a user who never accepted the AUP is blocked here too.
  const aupGate = await aupGateResponse(session.user.id);
  if (aupGate) return aupGate;

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

  // W7 guardrails (ADR-0008): resolve the invoking user's team posture so LLM
  // nodes scan with the team policy; failures fall back to the org default.
  // W3/ADR-0009: also resolve the executing user's team + effective model
  // allow-list so LLM/tool nodes are budget-attributed and model-confined.
  let guardrailPolicy: string | undefined;
  let teamId: string | null = null;
  let effectiveModelAllowList: string[] | null = null;
  try {
    const { getTeamPolicy, getUserPrimaryTeamId } = await import(
      "lib/admin/teams"
    );
    teamId = await getUserPrimaryTeamId(session.user.id);
    if (teamId) guardrailPolicy = (await getTeamPolicy(teamId)).guardrailPolicy;
  } catch {
    // org default applies
  }
  try {
    const { resolveEffectiveModelAllowList } = await import(
      "lib/admin/effective-models"
    );
    effectiveModelAllowList = await resolveEffectiveModelAllowList(
      session.user.id,
      teamId,
    );
  } catch {
    // unrestricted on resolver failure (fail open, matching the chat seam)
  }

  // W3 (ADR-0003): enforce the team budget before a synchronous run executes.
  const { checkBudget } = await import("lib/ai/budget");
  const budgetCheck = await checkBudget(session.user.id, teamId);
  if (!budgetCheck.allowed) {
    return Response.json(
      { message: budgetCheck.reason ?? "Team budget exhausted" },
      { status: 402 },
    );
  }

  const app = createWorkflowExecutor({
    edges,
    nodes,
    logger: wfLogger,
    agentSessionId,
    userId: session.user.id,
    guardrailPolicy,
    teamId,
    effectiveModelAllowList,
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
