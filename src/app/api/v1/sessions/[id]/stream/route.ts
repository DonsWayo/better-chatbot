import { getSessionWithSteps } from "lib/agent-platform/sessions";
import { apiError, requirePrincipal } from "../../../_lib/respond";
import { loadOwnedSession } from "../../../_lib/session-access";

export const dynamic = "force-dynamic";

// Terminal statuses end the stream. awaiting_approval is terminal for the
// stream's purposes: the run is parked until a human/API decides it, so we emit
// a final event and close (the client re-opens after deciding).
const TERMINAL = new Set([
  "completed",
  "failed",
  "cancelled",
  "awaiting_approval",
]);

const POLL_INTERVAL_MS = 1000;
const MAX_DURATION_MS = 5 * 60 * 1000;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// GET /api/v1/sessions/[id]/stream — Server-Sent Events of the session's
// status / step changes until terminal. Implemented by polling the DB at a
// short interval (no Electric dependency for external clients). Authenticated
// with the same Bearer key; ownership-scoped.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePrincipal(request, "sessions:read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const access = await loadOwnedSession(auth, id);
  if (!access.ok) return apiError("not_found", "Session not found");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastStatus: string | null = null;
      let lastStepCount = -1;
      const startedAt = Date.now();

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", close);

      const tick = async (): Promise<boolean> => {
        if (closed) return true;
        const withSteps = await getSessionWithSteps(id).catch(() => null);
        if (!withSteps) {
          controller.enqueue(
            encoder.encode(
              sse("error", { code: "not_found", message: "Session gone" }),
            ),
          );
          return true;
        }
        const { session, steps } = withSteps;

        // Emit a step event whenever a new step appears.
        if (steps.length !== lastStepCount) {
          lastStepCount = steps.length;
          const latest = steps[steps.length - 1];
          if (latest) {
            controller.enqueue(
              encoder.encode(
                sse("step", {
                  stepIndex: latest.stepIndex,
                  nodeId: latest.nodeId,
                  nodeKind: latest.nodeKind,
                  status: latest.status,
                  costUsd: latest.costUsd,
                }),
              ),
            );
          }
        }

        // Emit a status event on every status transition.
        if (session.status !== lastStatus) {
          lastStatus = session.status;
          controller.enqueue(
            encoder.encode(
              sse("status", {
                sessionId: session.id,
                status: session.status,
                costSoFar: session.costSoFar,
              }),
            ),
          );
        }

        if (TERMINAL.has(session.status)) {
          controller.enqueue(
            encoder.encode(
              sse("done", {
                sessionId: session.id,
                status: session.status,
                costSoFar: session.costSoFar,
                error: session.error,
              }),
            ),
          );
          return true;
        }
        return false;
      };

      // Initial snapshot + poll loop.
      try {
        let terminal = await tick();
        while (!terminal && !closed) {
          if (Date.now() - startedAt > MAX_DURATION_MS) {
            controller.enqueue(
              encoder.encode(
                sse("timeout", {
                  sessionId: id,
                  message: "Stream exceeded max duration; re-poll for status",
                }),
              ),
            );
            break;
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          terminal = await tick();
        }
      } catch {
        // fall through to close
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
