const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a syntactically valid UUID. Comparing a uuid column with
 * anything else makes Postgres raise 22P02 (a 500), so lookups by a
 * caller-supplied id treat a malformed id as "not found" before querying.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
