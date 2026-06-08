"server-only";

/**
 * W11 — context compression strategies.
 *
 * Each strategy operates on the params.prompt array (AI SDK v5 format) and
 * returns a compressed copy without mutating the original.
 *
 * AI SDK v5 prompt messages have complex union content types (string | Part[]).
 * We use narrow type guards and cast through unknown where needed to stay
 * correct without importing @ai-sdk/provider internal types.
 */

import type { LanguageModelMiddleware } from "ai";
import type { CompressionConfig } from "./config";

// Extract prompt type from the middleware signature — avoids depending on
// the @ai-sdk/provider internal package which is not a direct dep.
type TransformParams = Parameters<
  NonNullable<LanguageModelMiddleware["transformParams"]>
>[0];
type Prompt = TransformParams["params"]["prompt"];
type PromptMsg = Prompt[number];

export interface CompressionResult {
  prompt: Prompt;
  charsBefore: number;
  charsAfter: number;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isPart(v: unknown): v is { type: string; [k: string]: unknown } {
  return typeof v === "object" && v !== null && "type" in v;
}

function isTextPart(v: unknown): v is { type: "text"; text: string } {
  return isPart(v) && v.type === "text" && typeof (v as { text?: unknown }).text === "string";
}

function isToolResultPart(
  v: unknown,
): v is { type: "tool-result"; content: unknown[]; [k: string]: unknown } {
  return (
    isPart(v) &&
    v.type === "tool-result" &&
    Array.isArray((v as { content?: unknown }).content)
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function charCount(prompt: Prompt): number {
  let total = 0;
  for (const msg of prompt) {
    const content = msg.content;
    if (typeof content === "string") {
      total += content.length;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (isTextPart(part)) total += part.text.length;
        else if (isToolResultPart(part)) {
          for (const c of part.content) {
            if (isTextPart(c)) total += c.text.length;
          }
        }
      }
    }
  }
  return total;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const kept = text.slice(0, maxChars);
  const trimmed = text.length - maxChars;
  return `${kept}\n… [compressed: ${trimmed} chars removed]`;
}

// ---------------------------------------------------------------------------
// Strategy 1 — Tool output truncation
// ---------------------------------------------------------------------------

function compressToolOutputs(prompt: Prompt, maxChars: number): Prompt {
  if (maxChars === Infinity) return prompt;

  return prompt.map((msg) => {
    if (msg.role !== "tool") return msg;
    if (!Array.isArray(msg.content)) return msg;

    const newContent = msg.content.map((part) => {
      if (!isToolResultPart(part)) return part;
      const newResultContent = part.content.map((c) => {
        if (!isTextPart(c)) return c;
        return { ...c, text: truncate(c.text, maxChars) };
      });
      return { ...part, content: newResultContent };
    });

    return { ...msg, content: newContent } as PromptMsg;
  });
}

// ---------------------------------------------------------------------------
// Strategy 2 — Old assistant message truncation
// ---------------------------------------------------------------------------

function compressOldAssistantMessages(
  prompt: Prompt,
  recentWindow: number,
  maxChars: number,
): Prompt {
  if (recentWindow === Infinity || maxChars === Infinity) return prompt;

  const cutoffIdx = Math.max(0, prompt.length - recentWindow * 2);

  return prompt.map((msg, idx) => {
    if (idx >= cutoffIdx) return msg;
    if (msg.role !== "assistant") return msg;
    if (!Array.isArray(msg.content)) return msg;

    const newContent = msg.content.map((part) => {
      if (!isTextPart(part)) return part;
      return { ...part, text: truncate(part.text, maxChars) };
    });

    return { ...msg, content: newContent } as PromptMsg;
  });
}

// ---------------------------------------------------------------------------
// Strategy 3 — History drop
// ---------------------------------------------------------------------------

function dropOldHistory(
  prompt: Prompt,
  recentWindow: number,
  thresholdChars: number,
): Prompt {
  if (recentWindow === Infinity) return prompt;
  if (charCount(prompt) <= thresholdChars) return prompt;

  const systemMsgs = prompt.filter((m) => m.role === "system");
  const nonSystemMsgs = prompt.filter((m) => m.role !== "system");
  const kept = nonSystemMsgs.slice(-recentWindow * 2);
  const droppedCount = nonSystemMsgs.length - kept.length;

  if (droppedCount === 0) return prompt;

  const compressionNote = {
    role: "system" as const,
    content: [
      {
        type: "text" as const,
        text: `[Context note: ${droppedCount} older message(s) were omitted to stay within context limits. Summarize from available context.]`,
      },
    ],
  } as unknown as PromptMsg;

  return [...systemMsgs, compressionNote, ...kept];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function applyCompression(
  prompt: Prompt,
  config: CompressionConfig,
): CompressionResult {
  const charsBefore = charCount(prompt);

  if (config.level === "off") {
    return { prompt, charsBefore, charsAfter: charsBefore };
  }

  let compressed = compressToolOutputs(prompt, config.maxToolOutputChars);
  compressed = compressOldAssistantMessages(
    compressed,
    config.recentMessageWindow,
    config.maxOldAssistantMsgChars,
  );
  compressed = dropOldHistory(
    compressed,
    config.recentMessageWindow,
    config.historyCompressionThreshold,
  );

  return { prompt: compressed, charsBefore, charsAfter: charCount(compressed) };
}
