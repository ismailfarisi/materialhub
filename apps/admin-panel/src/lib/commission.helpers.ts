import { formatAedGrouped } from "./money";

/**
 * Commission units, as the backend stores them (order-service
 * CommissionService): every rate is a PERCENT — 10 means 10%, because
 * `calculateAmount` does `itemTotal * rate / 100`. A `fixed` vendor rate is
 * fils per item, and tier bounds are fils of the line total. The page used to
 * treat rates as fractions and showed a stored 10 as "1000.0%".
 */

/** 10 → "10%", 7.5 → "7.5%", 12.25 → "12.25%". */
export function formatPercent(rate: number | string | null | undefined): string {
  const n = Number(rate);
  if (rate == null || !Number.isFinite(n)) return "—";
  return `${Number(n.toFixed(2))}%`;
}

/** Parse a "%"-input into a percent number in [0, 100]; null if invalid. */
export function parsePercentInput(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/** The vendor override's base rate in its own unit. */
export function formatVendorRate(type: string | null | undefined, rate: number): string {
  if (type === "fixed") return `${formatAedGrouped(rate)} per item`;
  if (type === "tiered") return "By tier";
  return formatPercent(rate);
}
