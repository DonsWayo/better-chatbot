import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeDocumentChunkTable } from "lib/db/pg/schema.pg";
import { embedBatch, embedText } from "./index";
import { chunkText } from "./chunker";
import { eq, and } from "drizzle-orm";

export interface IngestOptions {
  collectionId: string;
  sourceRef: string;
  maxTokens?: number;
}

/** Ingest a document: chunk → embed → store. Returns number of chunks written. */
export async function ingestDocument(text: string, options: IngestOptions): Promise<number> {
  const { collectionId, sourceRef, maxTokens } = options;

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

  const embeddings = await embedBatch(chunks);

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

/** Retrieve top-k chunks relevant to a query, scoped to a collection. */
export async function retrieveChunks(
  query: string,
  collectionId: string,
  topK = 6,
): Promise<{ chunkText: string; sourceRef: string; chunkIndex: number }[]> {
  const queryEmbedding = await embedText(query);
  // pgvector cosine distance query — using raw SQL since Drizzle doesn't yet have first-class vector ops
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute(
    sql`SELECT chunk_text, source_ref, chunk_index
        FROM asafe_document_chunk
        WHERE collection_id = ${collectionId}
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${topK}`
  ) as { rows: { chunk_text: string; source_ref: string; chunk_index: number }[] };

  return rows.rows.map(r => ({
    chunkText: r.chunk_text,
    sourceRef: r.source_ref,
    chunkIndex: r.chunk_index,
  }));
}
