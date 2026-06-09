// Pinned embedding config per ADR-0007 — change REQUIRES a new migration + full re-embed
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSION = 1536;

/** Embed a single piece of text. Returns a float array of length EMBEDDING_DIMENSION. */
export async function embedText(text: string): Promise<number[]> {
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

  const data = await res.json() as { data: { embedding: number[] }[] };
  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: got ${embedding?.length}, expected ${EMBEDDING_DIMENSION}`);
  }
  return embedding;
}

/** Embed multiple texts in a single API call (batch). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
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

  const data = await res.json() as { data: { index: number; embedding: number[] }[] };
  // Sort by index in case the API returns out of order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}
