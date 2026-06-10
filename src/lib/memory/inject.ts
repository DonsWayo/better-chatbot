import "server-only";

import { embedText } from "lib/ai/embeddings";
import type { UserMemoryEntity } from "lib/db/pg/schema.pg";
import { bumpLastUsed, listActiveMemories } from "./store";

// ---------------------------------------------------------------------------
// Memory injection (docs/design/user-memory.md, read path): a token-budgeted
// <user_memory> block assembled into the system prompt at chat start —
// persistent injection like both market leaders, never a tool call.
// Ranking = relevance (cosine sim to the current message, when both the row
// embedding and a query embedding exist) + last-used recency + created
// recency. Memories per user are small (tens), so we fetch the actives once
// and score in process — same math as a pgvector `<=>` order-by without a
// second round trip.
// ---------------------------------------------------------------------------

/** ~800 tokens at the standard 4-chars/token estimate. */
export const MEMORY_PROMPT_TOKEN_BUDGET = 800;
export const CHARS_PER_TOKEN = 4;
export const MEMORY_PROMPT_CHAR_BUDGET =
  MEMORY_PROMPT_TOKEN_BUDGET * CHARS_PER_TOKEN;

const BLOCK_HEADER = `<user_memory>
The following are facts this user previously asked you to remember or established in earlier conversations. Treat them as background knowledge about the user: apply them when relevant, prefer newer facts on conflict, and do not recite this list unprompted. The user manages these in Settings → Personalization.`;
const BLOCK_FOOTER = `</user_memory>`;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredMemory {
  memory: UserMemoryEntity;
  score: number;
}

/**
 * Score actives: 0.45·similarity + 0.30·last-used recency + 0.25·created
 * recency. Without a query embedding (or for rows without one) the relevance
 * term is a neutral 0.5 so un-embedded rows aren't starved.
 */
export function rankMemories(
  memories: UserMemoryEntity[],
  queryEmbedding: number[] | null,
  now: Date = new Date(),
): ScoredMemory[] {
  const dayMs = 86_400_000;
  return memories
    .map((memory) => {
      const sim =
        queryEmbedding && memory.embedding
          ? Math.min(
              Math.max(cosineSimilarity(memory.embedding, queryEmbedding), 0),
              1,
            )
          : 0.5;
      const createdAgeDays =
        Math.max(now.getTime() - new Date(memory.createdAt).getTime(), 0) /
        dayMs;
      const usedAgeDays =
        Math.max(now.getTime() - new Date(memory.lastUsedAt).getTime(), 0) /
        dayMs;
      const score =
        0.45 * sim +
        0.3 * Math.exp(-usedAgeDays / 14) +
        0.25 * Math.exp(-createdAgeDays / 30);
      return { memory, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Greedy budget fill: take ranked memories until the formatted block would
 * exceed the char budget. Returns the block text and the included row ids.
 */
export function formatMemoryBlock(ranked: ScoredMemory[]): {
  block: string;
  includedIds: string[];
} | null {
  if (ranked.length === 0) return null;
  const lines: string[] = [];
  const includedIds: string[] = [];
  let used = BLOCK_HEADER.length + BLOCK_FOOTER.length + 2;
  for (const { memory } of ranked) {
    const line = `- [${memory.kind}] ${memory.content}`;
    if (used + line.length + 1 > MEMORY_PROMPT_CHAR_BUDGET && lines.length > 0)
      break;
    lines.push(line);
    includedIds.push(memory.id);
    used += line.length + 1;
  }
  return {
    block: `${BLOCK_HEADER}\n${lines.join("\n")}\n${BLOCK_FOOTER}`,
    includedIds,
  };
}

/**
 * Build the <user_memory> system-prompt block for a user, or null when there
 * is nothing to inject. Query embedding is best-effort; `last_used_at` is
 * bumped fire-and-forget for the included rows.
 *
 * Callers gate on policy + user mode (and temporary chats never reach the
 * persistent chat route at all).
 */
export async function buildMemoryPromptBlock(
  userId: string,
  currentMessageText?: string,
): Promise<string | null> {
  const actives = await listActiveMemories(userId);
  if (actives.length === 0) return null;

  const queryEmbedding =
    currentMessageText?.trim() &&
    actives.some((m) => m.embedding && m.embedding.length > 0)
      ? await embedText(currentMessageText).catch(() => null)
      : null;

  const formatted = formatMemoryBlock(rankMemories(actives, queryEmbedding));
  if (!formatted) return null;

  void bumpLastUsed(formatted.includedIds).catch(() => {});
  return formatted.block;
}
