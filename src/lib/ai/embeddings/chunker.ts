/** Rough token estimate: 1 token ≈ 4 characters. Good enough for chunking. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ChunkOptions {
  maxTokens?: number;   // default 800
  overlapTokens?: number; // default 120 (≈15% of 800)
}

/**
 * Split text into overlapping chunks suitable for embedding.
 * Tries to split on paragraph/sentence boundaries first.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxTokens = 800, overlapTokens = 120 } = options;
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  if (text.length <= maxChars) return [text.trim()];

  // Split on double newlines (paragraphs) first, then sentences
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (estimateTokens(candidate) <= maxTokens) {
      current = candidate;
    } else {
      if (current) {
        chunks.push(current.trim());
        // Overlap: keep the tail of current
        const tail = current.slice(-overlapChars);
        current = tail ? `${tail}\n\n${para}` : para;
      } else {
        // Single paragraph too large — split by sentences
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
        for (const sent of sentences) {
          const c2 = current ? `${current} ${sent}` : sent;
          if (estimateTokens(c2) <= maxTokens) {
            current = c2;
          } else {
            if (current) chunks.push(current.trim());
            current = sent;
          }
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 0);
}
