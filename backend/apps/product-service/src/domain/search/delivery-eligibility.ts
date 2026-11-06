// delivery-eligibility.ts — same-day / next-day search filter rules (workstream 5).
//
// The filter is a capability, not a clock reading: "this supplier can deliver
// to Dubai the same day it is ordered before its cutoff". It is resolved at
// query time from the suppliers' default warehouses, so the Typesense schema
// needs no new field and warehouse edits need no reindex. The time-aware
// promise ("order within 3 h") is order-service's delivery estimate.
//
// Emirate spelling and the warehouse choice mirror order-service
// `domain/shipping/estimate` (normaliseEmirate, resolveWarehouse).

export type DeliverySpeedFilter = "same_day" | "next_day";

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
];

export function normaliseEmirate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const key = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return EMIRATES.find((e) => e.toLowerCase() === key) ?? null;
}

export function parseDeliverySpeed(value: unknown): DeliverySpeedFilter | null {
  return value === "same_day" || value === "next_day" ? value : null;
}

interface WarehouseLists {
  handling_days: number;
  same_day_emirates: string[] | null;
  next_day_emirates: string[] | null;
}

/**
 * Whether a warehouse (with an optional product handling override) can
 * deliver to `emirate` at `speed` when ordered before its cutoff on a
 * working day.
 */
export function isDeliveryEligible(
  wh: WarehouseLists,
  speed: DeliverySpeedFilter,
  emirate: string,
  handlingOverride?: number | null,
): boolean {
  const handling = handlingOverride ?? Number(wh.handling_days ?? 1);
  const has = (list: string[] | null) => (list ?? []).some((e) => normaliseEmirate(e) === emirate);
  const sameDay = has(wh.same_day_emirates);
  const nextDay = has(wh.next_day_emirates);
  if (speed === "same_day") return handling === 0 && sameDay;
  return (handling === 0 && (sameDay || nextDay)) || (handling === 1 && sameDay);
}
