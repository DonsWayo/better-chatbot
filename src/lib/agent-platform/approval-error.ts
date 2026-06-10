// Agent Platform #24 — approval gate error.
//
// Deliberately NOT "server-only" and free of DB imports: it is thrown inside
// the ts-edge workflow graph (node-executor) and inspected by route/worker
// layers and tests. The approval semantic is "park the run": the executor
// creates an approval_request row, flips the session to awaiting_approval and
// throws this error so the graph halts. Catchers must treat it as a pause,
// not a failure.

export class ApprovalPendingError extends Error {
  readonly sessionId: string;
  readonly approvalId: string;

  constructor(sessionId: string, approvalId: string, message?: string) {
    super(message ?? "Approval pending — session parked awaiting a decision");
    this.name = "ApprovalPendingError";
    this.sessionId = sessionId;
    this.approvalId = approvalId;
  }
}

/**
 * True when `error` is (or was serialized from) an ApprovalPendingError.
 * The name-based fallback survives ts-edge wrapping / structured-clone, where
 * `instanceof` breaks across realms.
 */
export function isApprovalPending(
  error: unknown,
): error is ApprovalPendingError {
  if (error instanceof ApprovalPendingError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "ApprovalPendingError"
  );
}
