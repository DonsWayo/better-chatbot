// Pinned embedding config per ADR-0007 — change REQUIRES a new migration + full re-embed
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;

/**
 * Who to bill for an embedding call (Wave 6 ↔ Wave 3 cost accounting).
 * Callers that know the acting user thread it through so embedding spend
 * lands in the same `asafe_usage_event` ledger as chat completions.
 */
export interface EmbeddingAttribution {
  userId?: string;
  teamId?: string | null;
}

interface EmbeddingUsage {
  prompt_tokens?: number;
  total_tokens?: number;
}

/**
 * Fire-and-forget metering of embedding spend into the W3 usage ledger
 * (ADR-0003). Never throws and never blocks the embedding call.
 *
 * `asafe_usage_event.user_id` is NOT NULL with an FK to `user`, so there is
 * no representable "system" attribution — when no userId is provided the
 * event is intentionally skipped (the insert would only fail the FK and log
 * an error). All production callers thread the acting user.
 */
function meterEmbeddingUsage(
  usage: EmbeddingUsage | undefined,
  attribution: EmbeddingAttribution | undefined,
): void {
  const promptTokens = usage?.prompt_tokens ?? 0;
  if (promptTokens <= 0) return;
  const userId = attribution?.userId;
  if (!userId) return;

  void import("lib/ai/budget")
    .then(({ recordUsage, estimateCostUsd }) =>
      recordUsage({
        userId,
        teamId: attribution?.teamId ?? null,
        sessionId: null,
        model: EMBEDDING_MODEL,
        provider: "openRouter",
        taskClass: "embedding",
        tier: null,
        promptTokens,
        completionTokens: 0,
        costUsd: estimateCostUsd(EMBEDDING_MODEL, promptTokens, 0),
      }),
    )
    .catch(() => {
      // Metering must never break embedding; recordUsage itself also
      // swallows DB errors, this guards the dynamic import path.
    });
}

/** Embed a single piece of text. Returns a float array of length EMBEDDING_DIMENSION. */
export async function embedText(
  text: string,
  attribution?: EmbeddingAttribution,
): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { data: { embedding: number[] }[]; usage?: EmbeddingUsage };
  meterEmbeddingUsage(data.usage, attribution);

  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: got ${embedding?.length}, expected ${EMBEDDING_DIMENSION}`);
  }
  return embedding;
}

/** Embed multiple texts in a single API call (batch). */
export async function embedBatch(
  texts: string[],
  attribution?: EmbeddingAttribution,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding batch API error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    data: { index: number; embedding: number[] }[];
    usage?: EmbeddingUsage;
  };
  meterEmbeddingUsage(data.usage, attribution);

  // Sort by index in case the API returns out of order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}
