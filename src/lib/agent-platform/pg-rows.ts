// Agent Platform #22 — helpers for raw `db.execute(sql...)` results.
//
// The scheduler/worker claim queries (UPDATE ... FOR UPDATE SKIP LOCKED ...
// RETURNING *) go through drizzle's sql template, which hands back driver
// rows in snake_case rather than typed entities. These helpers normalize the
// driver result shape and column types.

/** node-postgres returns `{ rows: [...] }`; be tolerant of bare arrays too. */
export function extractRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
