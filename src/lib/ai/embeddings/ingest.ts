import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeDocumentChunkTable } from "lib/db/pg/schema.pg";
import { embedBatch, type EmbeddingAttribution } from "./index";
import { chunkText } from "./chunker";
import { eq, and } from "drizzle-orm";

export interface IngestOptions {
  collectionId: string;
  sourceRef: string;
  maxTokens?: number;
  /** Who to bill the embedding tokens to (W3 usage ledger). */
  attribution?: EmbeddingAttribution;
}

/** Ingest a document: chunk → embed → store. Returns number of chunks written. */
export async function ingestDocument(text: string, options: IngestOptions): Promise<number> {
  const { collectionId, sourceRef, maxTokens, attribution } = options;

  // Remove old chunks for this sourceRef in this collection
  await db.delete(AsafeDocumentChunkTable)
    .where(
      and(
        eq(AsafeDocumentChunkTable.collectionId, collectionId),
        eq(AsafeDocumentChunkTable.sourceRef, sourceRef),
      )
    );

  const chunks = chunkText(text, { maxTokens });
  if (chunks.length === 0) return 0;

  const embeddings = await embedBatch(chunks, attribution);

  await db.insert(AsafeDocumentChunkTable).values(
    chunks.map((chunkContent, i) => ({
      collectionId,
      sourceRef,
      chunkIndex: i,
      chunkText: chunkContent,
      embedding: embeddings[i],
    }))
  );

  return chunks.length;
}

/**
 * Retrieve top-k chunks relevant to a query, scoped to a single collection.
 * Delegates to the hybrid (vector + FTS, RRF-fused) retriever — kept for
 * back-compat with callers that predate multi-collection retrieval.
 */
export async function retrieveChunks(
  query: string,
  collectionId: string,
  topK = 6,
): Promise<{ chunkText: string; sourceRef: string; chunkIndex: number }[]> {
  const { hybridRetrieve } = await import("./retrieval");
  const chunks = await hybridRetrieve(query, [collectionId], topK);
  return chunks.map((c) => ({
    chunkText: c.chunkText,
    sourceRef: c.sourceRef,
    chunkIndex: c.chunkIndex,
  }));
}
