import type { RagSource } from "app-types/chat";
import { sql } from "drizzle-orm";
import { canAccess } from "lib/visibility";
import { embedText, type EmbeddingAttribution } from "./index";

/**
 * Hybrid retrieval (Wave 6 phase 2, ADR-0007): reciprocal rank fusion of
 * pgvector cosine search and Postgres full-text search, with a small recency
 * boost. Raw SQL via db.execute, matching the existing embeddings style.
 */

/** RRF constant — the classic k=60 from Cormack et al. */
export const RRF_K = 60;
/** Candidates fetched per ranked list before fusion. */
export const CANDIDATES_PER_LIST = 20;
/** Default number of fused chunks returned. */
export const DEFAULT_TOP_K = 6;

export interface RetrievedChunk {
  collectionId: string;
  sourceRef: string;
  chunkIndex: number;
  chunkText: string;
  /** Normalized fused score in (0, 1]; the best chunk is always 1. */
  score: number;
}

/** Raw candidate row as returned by the two SQL queries (snake_case). */
export interface CandidateRow {
  collection_id: string;
  source_ref: string;
  chunk_index: number;
  chunk_text: string;
  created_at: string | Date | null;
}

function chunkKey(row: CandidateRow): string {
  return `${row.collection_id}|${row.source_ref}|${row.chunk_index}`;
}

/**
 * Pure fusion step: reciprocal rank fusion (1 / (k + rank), rank 1-based) of
 * the vector and FTS candidate lists, deduping chunks that appear in both,
 * then a small recency boost (× 1 + 0.1·e^(−ageDays/30)) and normalization
 * so the top chunk always scores 1. With an empty FTS list this degrades to
 * pure vector ordering.
 */
export function fuseCandidates(
  vectorRows: CandidateRow[],
  ftsRows: CandidateRow[],
  opts: { topK?: number; now?: Date } = {},
): RetrievedChunk[] {
  const { topK = DEFAULT_TOP_K, now = new Date() } = opts;

  const fused = new Map<string, { row: CandidateRow; rrf: number }>();
  for (const list of [vectorRows, ftsRows]) {
    list.forEach((row, i) => {
      const key = chunkKey(row);
      const contribution = 1 / (RRF_K + i + 1);
      const existing = fused.get(key);
      if (existing) existing.rrf += contribution;
      else fused.set(key, { row, rrf: contribution });
    });
  }
  if (fused.size === 0) return [];

  const scored = [...fused.values()].map(({ row, rrf }) => {
    let boost = 1;
    if (row.created_at != null) {
      const createdAt = new Date(row.created_at);
      if (Number.isFinite(createdAt.getTime())) {
        const ageDays = Math.max(
          0,
          (now.getTime() - createdAt.getTime()) / 86_400_000,
        );
        boost = 1 + 0.1 * Math.exp(-ageDays / 30);
      }
    }
    return { row, score: rrf * boost };
  });

  scored.sort((a, b) => b.score - a.score);
  const max = scored[0].score;

  return scored.slice(0, topK).map(({ row, score }) => ({
    collectionId: row.collection_id,
    sourceRef: row.source_ref,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    score: max > 0 ? score / max : 0,
  }));
}

/**
 * Hybrid retrieval across one or more collections: top-20 pgvector cosine +
 * top-20 Postgres FTS (websearch_to_tsquery over the generated `fts` column,
 * ranked by ts_rank_cd), fused with RRF. FTS failures (e.g. unparsable query)
 * fall back to pure vector results rather than erroring the chat.
 */
export async function hybridRetrieve(
  query: string,
  collectionIds: string[],
  topK = DEFAULT_TOP_K,
  attribution?: EmbeddingAttribution,
): Promise<RetrievedChunk[]> {
  if (collectionIds.length === 0) return [];

  const queryEmbedding = await embedText(query, attribution);
  const { pgDb: db } = await import("lib/db/pg/db.pg");

  const idList = sql.join(
    collectionIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const vectorQuery = db.execute(
    sql`SELECT collection_id, source_ref, chunk_index, chunk_text, created_at
        FROM asafe_document_chunk
        WHERE collection_id IN (${idList})
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${CANDIDATES_PER_LIST}`,
  ) as unknown as Promise<{ rows: CandidateRow[] }>;

  const ftsQuery = (
    db.execute(
      sql`SELECT collection_id, source_ref, chunk_index, chunk_text, created_at
          FROM asafe_document_chunk
          WHERE collection_id IN (${idList})
            AND fts @@ websearch_to_tsquery('english', ${query})
          ORDER BY ts_rank_cd(fts, websearch_to_tsquery('english', ${query})) DESC
          LIMIT ${CANDIDATES_PER_LIST}`,
    ) as unknown as Promise<{ rows: CandidateRow[] }>
  ).catch(() => ({ rows: [] as CandidateRow[] }));

  const [vectorRes, ftsRes] = await Promise.all([vectorQuery, ftsQuery]);
  return fuseCandidates(vectorRes.rows, ftsRes.rows, { topK });
}

// ── citation-first chat payload ──────────────────────────────────────────────

export interface RagPayload {
  /** Prompt block body: `[Source N: ref]` headers + chunk text. */
  context: string;
  /** Deduped source list; `index` matches the [Source N] numbering above. */
  sources: RagSource[];
}

/**
 * Build the prompt context and the deduped, stably-numbered source list from
 * fused chunks. Chunks from the same (collection, sourceRef) share one
 * [Source N] number — assigned in order of first appearance (best score
 * first), so numbering is identical in the prompt block and the UI list.
 */
export function buildRagPayload(
  chunks: RetrievedChunk[],
  collectionNames: Record<string, string>,
): RagPayload | null {
  if (chunks.length === 0) return null;

  const sourceIndex = new Map<string, RagSource>();
  for (const chunk of chunks) {
    const key = `${chunk.collectionId}|${chunk.sourceRef}`;
    const existing = sourceIndex.get(key);
    if (existing) {
      existing.score = Math.max(existing.score, chunk.score);
    } else {
      sourceIndex.set(key, {
        index: sourceIndex.size + 1,
        sourceRef: chunk.sourceRef,
        collectionId: chunk.collectionId,
        collectionName:
          collectionNames[chunk.collectionId] ?? "Knowledge base",
        score: chunk.score,
      });
    }
  }

  const context = chunks
    .map((chunk) => {
      const source = sourceIndex.get(
        `${chunk.collectionId}|${chunk.sourceRef}`,
      )!;
      return `[Source ${source.index}: ${chunk.sourceRef}]\n${chunk.chunkText}`;
    })
    .join("\n\n");

  return { context, sources: [...sourceIndex.values()] };
}

/** Resolve collection display names for the citation list. */
export async function getCollectionNames(
  collectionIds: string[],
): Promise<Record<string, string>> {
  if (collectionIds.length === 0) return {};
  const { pgDb: db } = await import("lib/db/pg/db.pg");
  const idList = sql.join(
    collectionIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const res = (await db.execute(
    sql`SELECT id, name FROM asafe_knowledge_collection WHERE id IN (${idList})`,
  )) as unknown as { rows: { id: string; name: string }[] };
  return Object.fromEntries(res.rows.map((r) => [r.id, r.name]));
}

/**
 * Visibility gate for retrieval entry points: keep only the collections the
 * user can `use` (unified resolver, entityType "knowledge_collection").
 */
export async function filterAccessibleCollections(
  collectionIds: string[],
  userId: string,
): Promise<string[]> {
  const unique = [...new Set(collectionIds)];
  const decisions = await Promise.all(
    unique.map((id) =>
      canAccess("knowledge_collection", id, userId, "use").catch(() => false),
    ),
  );
  return unique.filter((_, i) => decisions[i]);
}

/**
 * Chat entry point: filter mentioned collections by access, run hybrid
 * retrieval across the survivors, and return the citation-first payload
 * (prompt block + deduped numbered source list). Null when nothing is
 * retrievable.
 */
export async function retrieveForChat(
  query: string,
  collectionIds: string[],
  userId: string,
  topK = DEFAULT_TOP_K,
  teamId?: string | null,
): Promise<RagPayload | null> {
  const accessible = await filterAccessibleCollections(collectionIds, userId);
  if (accessible.length === 0) return null;

  const chunks = await hybridRetrieve(query, accessible, topK, {
    userId,
    teamId: teamId ?? null,
  });
  if (chunks.length === 0) return null;

  const names = await getCollectionNames(accessible).catch(
    () => ({}) as Record<string, string>,
  );
  return buildRagPayload(chunks, names);
}
