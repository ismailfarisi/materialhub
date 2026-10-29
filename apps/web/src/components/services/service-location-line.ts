import type { ServiceListItem } from "../../lib/booking/types";

export type AreaBucket = "premises" | "home_visit";

/**
 * `premises_area_ids` / `home_visit_area_ids` carry IDS; the display names live
 * in `area_names`, index-aligned with `area_ids` (guaranteed by the indexer —
 * see serviceOfferingToDocument). So a name is resolved by position.
 *
 * An id with no matching name is skipped rather than rendered as `undefined`;
 * that can only happen if the alignment invariant is violated, and a missing
 * area is better than the literal string "undefined" on a card.
 */
export function areaNamesFor(item: ServiceListItem, bucket: AreaBucket): string[] {
  const ids = bucket === "premises" ? item.premises_area_ids : item.home_visit_area_ids;
  if (!ids?.length) return [];
  const out: string[] = [];
  for (const id of ids) {
    const i = item.area_ids.indexOf(id);
    if (i === -1) continue;
    const name = item.area_names[i];
    if (name) out.push(name);
  }
  return out;
}
