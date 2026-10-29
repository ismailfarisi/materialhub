export const DEFAULT_COLLECTION_CEILING = 2000;

/**
 * Merge a collection's pinned ids (custom order) with rule-matched ids (already
 * in the desired sort order from Typesense), removing excludes and duplicates.
 * Pins always lead. Uniform across all sort modes: the sort only changes the
 * order ruleIds arrive in. Result is capped.
 */
export function orderMembers(opts: {
  pinIds: string[];
  ruleIds: string[];
  excludeIds: string[];
  cap: number;
}): string[] {
  const exclude = new Set(opts.excludeIds);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string) => {
    if (exclude.has(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of opts.pinIds) push(id);
  for (const id of opts.ruleIds) push(id);
  return out.slice(0, opts.cap);
}

export function paginate<T>(items: T[], page: number, perPage: number): T[] {
  if (page < 1) return [];
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}
