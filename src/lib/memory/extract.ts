import "server-only";

import { generateObject } from "ai";
import type { ChatModel } from "app-types/chat";
import type { UserPreferences } from "app-types/user";
import { embedText } from "lib/ai/embeddings";
import { customModelProvider } from "lib/ai/models";
import type { UserMemoryEntity } from "lib/db/pg/schema.pg";
import { userRepository } from "lib/db/repository";
import globalLogger from "logger";
import { z } from "zod";
import {
  type MemoryMode,
  type MemoryPolicy,
  resolveMemoryPolicy,
} from "./policy";
import { insertMemory, listActiveMemories, supersedeMemory } from "./store";

const logger = globalLogger.withDefaults({ message: "UserMemory extract: " });

// ---------------------------------------------------------------------------
// Post-turn memory extraction (docs/design/user-memory.md, write path).
// Fire-and-forget after the chat stream finishes — never blocks the response.
// Dual-path capture: explicit "remember this" (confidence 1.0, allowed
// whenever memory is enabled) + implicit background extraction (org-policy
// gated, default OFF pending legal sign-off).
// ---------------------------------------------------------------------------

/** Cheapest approved model — extraction is high-volume, low-stakes. */
export const MEMORY_EXTRACTION_MODEL: ChatModel = {
  provider: "openRouter",
  model: "gemini-3.1-flash-lite",
};

/** Max memories stored from a single turn. */
export const MAX_MEMORIES_PER_TURN = 5;

/** Max chars of user/assistant text passed to the extractor. */
export const EXTRACTION_TEXT_LIMIT = 4_000;

/**
 * Cheap pre-filter for explicit remember-intent across the deployed locales
 * (en/es/fr/no + CJK). Deliberately loose — it only decides whether the
 * extractor RUNS on the explicit-only path; the model decides what (if
 * anything) was actually asked to be remembered.
 */
const REMEMBER_INTENT_REGEX =
  /\b(remember|memor\w*|recuerd\w*|recuérd\w*|rappelle\w*|souviens|souvenir|retiens|husk\w*|merk deg)\b|覚えて|記憶して|기억해|기억하|记住|記住/i;

export function hasExplicitRememberIntent(text: string): boolean {
  return REMEMBER_INTENT_REGEX.test(text);
}

export interface ExtractionGateInput {
  policy: MemoryPolicy;
  /** User tri-state from preferences; absent → "on". */
  memoryMode: MemoryMode | undefined;
  userText: string;
}

export interface ExtractionGateResult {
  extract: boolean;
  /** When false, only explicitly-requested memories may be stored. */
  implicitAllowed: boolean;
}

/**
 * Pure gate: extraction runs only when org/team policy enables memory AND the
 * user's mode is "on" (paused/off skip both read and write) AND either
 * implicit extraction is policy-enabled or the user text shows explicit
 * remember-intent (explicit is default-on whenever memory is enabled).
 *
 * Temporary chats never reach this code path at all — they are served by the
 * separate /api/chat/temporary route, which neither reads nor writes memory.
 */
export function shouldExtractFromTurn(
  input: ExtractionGateInput,
): ExtractionGateResult {
  const { policy, memoryMode, userText } = input;
  if (!policy.enabled || (memoryMode ?? "on") !== "on") {
    return { extract: false, implicitAllowed: false };
  }
  const implicitAllowed = policy.implicitExtraction;
  return {
    extract: implicitAllowed || hasExplicitRememberIntent(userText),
    implicitAllowed,
  };
}

const extractionResultSchema = z.object({
  memories: z
    .array(
      z.object({
        kind: z.enum(["preference", "decision", "profile", "project_context"]),
        content: z.string().min(1).max(300),
        explicit: z
          .boolean()
          .describe("true only when the user explicitly asked to remember it"),
        confidence: z.number().min(0).max(1),
        supersedes: z
          .string()
          .nullable()
          .describe(
            "verbatim content of the EXISTING memory this new fact contradicts/replaces, or null",
          ),
      }),
    )
    .max(MAX_MEMORIES_PER_TURN),
});

export type ExtractedMemoryCandidate = z.infer<
  typeof extractionResultSchema
>["memories"][number];

function normalize(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildExtractionPrompt(input: {
  userText: string;
  assistantText: string;
  existingContents: string[];
  implicitAllowed: boolean;
}): string {
  const existing =
    input.existingContents.length > 0
      ? input.existingContents.map((c) => `- ${c}`).join("\n")
      : "(none)";
  return `You maintain a long-term memory of durable facts about a user of a workplace AI assistant.

From the conversation turn below, extract durable facts worth remembering across future conversations, typed as:
- "preference": how the user likes things done (style, format, language, tools)
- "decision": a decision the user made or recorded
- "profile": stable facts about the user (role, team, skills)
- "project_context": ongoing work context (projects, systems, deadlines)

Rules:
- Each fact must be a single, self-contained sentence (max 300 chars), usable without this conversation.
- Mark "explicit": true ONLY when the user explicitly asked to remember it (e.g. "remember that...").${
    input.implicitAllowed
      ? ""
      : `
- IMPORTANT: implicit extraction is disabled by policy. Extract ONLY facts the user explicitly asked to remember; return an empty list otherwise.`
  }
- Do NOT extract special-category personal data (health, religious or political beliefs, trade-union membership, sexual orientation, ethnicity) unless the user explicitly and unambiguously asked you to remember it.
- Do NOT extract transient task details, pleasantries, or anything already covered by an existing memory below (skip exact or near duplicates).
- If a new fact contradicts or replaces one of the EXISTING memories, set "supersedes" to that existing memory's verbatim content; otherwise null.
- Quality over quantity: usually 0–2 facts per turn. An empty list is a good answer.

EXISTING memories:
${existing}

USER message:
${input.userText.slice(0, EXTRACTION_TEXT_LIMIT)}

ASSISTANT reply:
${input.assistantText.slice(0, EXTRACTION_TEXT_LIMIT)}`;
}

export interface ExtractMemoriesInput {
  userId: string;
  threadId: string;
  userText: string;
  assistantText: string;
  /** When false, candidates not marked explicit are dropped. Default true. */
  implicitAllowed?: boolean;
}

/**
 * Run the extractor model and persist the surviving candidates. Embeddings
 * are best-effort (failure → stored without embedding). Returns stored rows.
 */
export async function extractMemoriesFromTurn(
  input: ExtractMemoriesInput,
): Promise<UserMemoryEntity[]> {
  const implicitAllowed = input.implicitAllowed ?? true;
  const existing = await listActiveMemories(input.userId);
  const existingByContent = new Map(
    existing.map((m) => [normalize(m.content), m]),
  );

  const model = customModelProvider.getModel(MEMORY_EXTRACTION_MODEL);
  const { object } = await generateObject({
    model,
    schema: extractionResultSchema,
    prompt: buildExtractionPrompt({
      userText: input.userText,
      assistantText: input.assistantText,
      existingContents: existing.map((m) => m.content),
      implicitAllowed,
    }),
  });

  const stored: UserMemoryEntity[] = [];
  for (const candidate of object.memories.slice(0, MAX_MEMORIES_PER_TURN)) {
    if (!implicitAllowed && !candidate.explicit) continue;
    const key = normalize(candidate.content);
    if (!key || existingByContent.has(key)) continue; // dedup vs actives

    const embedding = await embedText(candidate.content).catch((e) => {
      logger.warn("embedding failed (storing without):", e?.message ?? e);
      return null;
    });

    const row = await insertMemory({
      userId: input.userId,
      kind: candidate.kind,
      content: candidate.content,
      embedding,
      sourceThreadId: input.threadId,
      confidence: candidate.explicit
        ? 1
        : Math.min(Math.max(candidate.confidence, 0), 1),
    });
    stored.push(row);
    existingByContent.set(key, row); // dedup within the same turn too

    if (candidate.supersedes) {
      const old = existingByContent.get(normalize(candidate.supersedes));
      if (old && old.id !== row.id) {
        await supersedeMemory(old.id, row.id, input.userId);
      }
    }
  }
  return stored;
}

export interface PostTurnExtractionInput {
  userId: string;
  teamId: string | null;
  threadId: string;
  userText: string;
  assistantText: string;
  /** Thread-level preferences when available; null → fetched from the DB. */
  preferences?: UserPreferences | null;
}

/**
 * Full post-turn pipeline used by the chat route's onFinish (fire-and-forget):
 * resolve policy + user mode, evaluate the gate, then extract & store.
 * Returns the number of memories stored (0 when gated off).
 */
export async function runPostTurnMemoryExtraction(
  input: PostTurnExtractionInput,
): Promise<number> {
  if (!input.userText.trim()) return 0;

  const policy = await resolveMemoryPolicy(input.teamId);
  const preferences =
    input.preferences ?? (await userRepository.getPreferences(input.userId));
  const gate = shouldExtractFromTurn({
    policy,
    memoryMode: preferences?.memoryMode,
    userText: input.userText,
  });
  if (!gate.extract) return 0;

  const stored = await extractMemoriesFromTurn({
    userId: input.userId,
    threadId: input.threadId,
    userText: input.userText,
    assistantText: input.assistantText,
    implicitAllowed: gate.implicitAllowed,
  });
  if (stored.length > 0) {
    logger.info(`stored ${stored.length} memorie(s) for user ${input.userId}`);
  }
  return stored.length;
}
