/**
 * Pure state machine: map real opencode SDK events onto UIMessage[].
 *
 * Event protocol (verified against @opencode-ai/sdk@1.17.9 types.gen.d.ts):
 *
 *   "message.part.updated"   → { part: Part, delta?: string }
 *   "message.part.removed"   → { sessionID, messageID, partID }
 *   "permission.updated"     → Permission { id, type, title, sessionID, messageID, callID, ... }
 *   "permission.replied"     → { sessionID, permissionID, response }
 *   "session.status"         → { sessionID, status: { type: "idle"|"busy"|"retry", ... } }
 *   "session.idle"           → { sessionID }
 *   "session.error"          → { sessionID?, error? }
 *   "file.edited"            → { file: string }  (path only, no diff — handled via ToolPart)
 *
 * All content flows through "message.part.updated". Each Part has a unique
 * `id` field used for upsert (replace-in-place or append). Parts are stored
 * with a `_partId` sentinel so the "message.part.removed" event can filter
 * them out without requiring a separate index.
 *
 * Tool parts use the `tool-opencode__<toolName>` type prefix so AI SDK v5's
 * isToolUIPart() recognises them and the existing ToolMessagePart renderer
 * handles them — zero changes to message.tsx needed.
 *
 * ToolState → AI SDK UIMessage ToolUIPart state mapping:
 *   pending   → "input-streaming"   (tool call being assembled)
 *   running   → "output-running"    (tool is executing)
 *   completed → "output-available"  (done, output string available)
 *   error     → "output-error"      (failed, error string available)
 */

import type { UIMessage } from "ai";
import type { OpencodeEvent } from "@/types/opencode";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOrCreateAssistant(
  messages: UIMessage[],
  messageId: string,
): UIMessage[] {
  if (messages.some((m) => m.id === messageId && m.role === "assistant")) {
    return messages;
  }
  const newMsg: UIMessage = {
    id: messageId,
    role: "assistant",
    content: "",
    parts: [],
  } as any;
  return [...messages, newMsg];
}

function updateAssistant(
  messages: UIMessage[],
  messageId: string,
  updater: (parts: any[]) => any[],
): UIMessage[] {
  return messages.map((m) => {
    if (m.id === messageId && m.role === "assistant") {
      return { ...m, parts: updater(m.parts as any[]) } as UIMessage;
    }
    return m;
  });
}

// ---------------------------------------------------------------------------
// Part mapping
// ---------------------------------------------------------------------------

function toolStateToUiState(state: any): string {
  switch (state?.status) {
    case "pending":
      return "input-streaming";
    case "running":
      return "output-running";
    case "completed":
      return "output-available";
    case "error":
      return "output-error";
    default:
      return "input-streaming";
  }
}

/**
 * Map an opencode Part (from message.part.updated) to the shape we store in
 * UIMessage.parts. Returns null for internal bookkeeping parts we don't render.
 * The `_partId` field is our internal upsert key and is ignored by renderers.
 */
function mapPartToUiPart(part: any): any | null {
  if (!part?.type) return null;

  if (part.type === "text") {
    return { type: "text", text: part.text ?? "", _partId: part.id };
  }

  if (part.type === "reasoning") {
    return { type: "reasoning", text: part.text ?? "", _partId: part.id };
  }

  if (part.type === "tool") {
    const uiState = toolStateToUiState(part.state);
    return {
      type: `tool-opencode__${part.tool}`,
      toolCallId: part.callID,
      state: uiState,
      input: part.state?.input ?? {},
      output:
        part.state?.status === "completed" ? part.state.output : undefined,
      errorText:
        part.state?.status === "error" ? part.state.error : undefined,
      _partId: part.id,
    };
  }

  // Skip step-start, step-finish, snapshot, patch, file, subtask, agent, etc.
  // These are opencode internal bookkeeping — nothing to render in chat.
  return null;
}

function upsertPart(parts: any[], mappedPart: any): any[] {
  const idx = parts.findIndex((p: any) => p._partId === mappedPart._partId);
  if (idx >= 0) {
    const updated = [...parts];
    updated[idx] = mappedPart;
    return updated;
  }
  return [...parts, mappedPart];
}

/**
 * Build a permission tool part from a Permission event.
 * Stored as `tool-opencode__permission` so it flows through ToolMessagePart
 * and is dispatched to OpencodePermissionPart by name.
 */
function buildPermissionPart(perm: any): any {
  return {
    type: "tool-opencode__permission",
    toolCallId: perm.callID ?? perm.id,
    state: "input-available",
    input: {
      permissionId: perm.id,
      sessionId: perm.sessionID,
      tool: perm.type,
      title: perm.title,
      pattern: perm.pattern,
      metadata: perm.metadata ?? {},
    },
    _partId: perm.id,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply one opencode event onto the UIMessage array.
 * Pure — safe to use as: setMessages(prev => applyOpencodeEvent(prev, event))
 */
export function applyOpencodeEvent(
  messages: UIMessage[],
  event: OpencodeEvent,
): UIMessage[] {
  const { type, properties: p } = event;

  switch (type) {
    // ── Content streaming ───────────────────────────────────────────────────

    case "message.part.updated": {
      const part = (p as any).part;
      if (!part?.messageID || !part?.id) return messages;
      const mapped = mapPartToUiPart(part);
      if (!mapped) return messages;
      const msgs = getOrCreateAssistant(messages, part.messageID);
      return updateAssistant(msgs, part.messageID, (parts) =>
        upsertPart(parts, mapped),
      );
    }

    case "message.part.removed": {
      const messageID: string = p.messageID;
      const partID: string = p.partID;
      if (!messageID || !partID) return messages;
      return updateAssistant(messages, messageID, (parts) =>
        parts.filter((part: any) => part._partId !== partID),
      );
    }

    // ── Permission request / reply ──────────────────────────────────────────

    case "permission.updated": {
      const perm = p as any;
      if (!perm?.messageID || !perm?.id) return messages;
      const permPart = buildPermissionPart(perm);
      const msgs = getOrCreateAssistant(messages, perm.messageID);
      return updateAssistant(msgs, perm.messageID, (parts) =>
        upsertPart(parts, permPart),
      );
    }

    case "permission.replied": {
      const permissionID: string = p.permissionID ?? p.permissionId;
      const response: string = p.response;
      if (!permissionID) return messages;
      return messages.map((m) => {
        if (m.role !== "assistant") return m;
        const hasIt = (m.parts as any[]).some(
          (part: any) =>
            part.type === "tool-opencode__permission" &&
            part._partId === permissionID,
        );
        if (!hasIt) return m;
        return {
          ...m,
          parts: (m.parts as any[]).map((part: any) =>
            part.type === "tool-opencode__permission" &&
            part._partId === permissionID
              ? { ...part, state: "output-available", output: { response } }
              : part,
          ),
        } as UIMessage;
      });
    }

    // ── file.edited: path-only notification (no diff) ──────────────────────
    // Tool edits are already captured via "message.part.updated" ToolParts.
    // Ignore file watcher events to avoid duplicate noise in the chat.
    case "file.edited":
      return messages;

    // ── Lifecycle events handled in use-opencode-session.ts ────────────────
    case "session.status":
    case "session.idle":
    case "session.error":
    case "session.created":
    case "session.updated":
      return messages;

    default:
      return messages;
  }
}
