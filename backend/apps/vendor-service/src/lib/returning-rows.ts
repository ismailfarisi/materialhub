/**
 * TypeORM's Postgres driver returns `[rows, affectedCount]` for
 * UPDATE/DELETE ... RETURNING but a plain `rows` array for SELECT and
 * INSERT ... RETURNING. Normalise to the rows.
 */
export function returningRows<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === "number") {
    return raw[0] as T[];
  }
  return raw as T[];
}
