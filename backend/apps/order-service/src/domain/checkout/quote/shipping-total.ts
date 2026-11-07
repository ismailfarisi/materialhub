import type { SampleShippingRule } from "../../cart/pricing/sample-shipping.ts";
import { type DgItem, type DgRate, formDeliveryGroups } from "./delivery-groups.ts";

export interface SelectedShippingInput {
  items: DgItem[];
  rates: DgRate[];
  zoneId: string | null;
  vendorHolidays: Set<string>;
  subtotalFils: number;
  sampleShipping?: SampleShippingRule;
}

/**
 * Charged shipping (fils) = sum over delivery groups of the cheapest available
 * method's price. This is the single definition shared by the checkout quote
 * and order creation so the displayed total always matches the charged total.
 * Returns 0 when there are no items. Groups with no available method contribute
 * nothing here; availability/blocking is surfaced separately by the quote.
 */
export function selectedShippingFils(input: SelectedShippingInput): number {
  if (input.items.length === 0) return 0;
  const groups = formDeliveryGroups(input);
  let total = 0;
  for (const g of groups) {
    if (g.methods.length === 0) continue;
    const cheapest = [...g.methods].sort((a, b) => a.price_fils - b.price_fils)[0];
    if (cheapest) total += cheapest.price_fils;
  }
  return total;
}

/**
 * The same charged shipping, split per vendor (fils). A delivery group can
 * hold several vendors whose method sets match; its price for a method is the
 * sum of each vendor's own rate for it. Pick each group's cheapest method
 * exactly as `selectedShippingFils` does, then give every vendor in the group
 * its own rate for that method, so the parts add up to `selectedShippingFils`.
 * Vendors whose group has no available method get 0. This is what
 * `vendor_orders.shipping_cost` records, and what a vendor sub-order that is
 * rejected or emptied before delivery takes off the order.
 */
export function selectedShippingByVendor(input: SelectedShippingInput): Record<string, number> {
  const out: Record<string, number> = {};
  if (input.items.length === 0) return out;
  for (const v of new Set(input.items.map((i) => i.vendor_id))) out[v] = 0;
  for (const g of formDeliveryGroups(input)) {
    if (g.methods.length === 0) continue;
    const cheapest = [...g.methods].sort((a, b) => a.price_fils - b.price_fils)[0];
    if (!cheapest) continue;
    for (const vendorId of g.vendorIds) {
      const own = formDeliveryGroups({
        ...input,
        items: input.items.filter((i) => i.vendor_id === vendorId),
      });
      const m = own.flatMap((x) => x.methods).find((x) => x.id === cheapest.id);
      out[vendorId] = m?.price_fils ?? 0;
    }
  }
  return out;
}

/**
 * Make per-vendor shipping add up to exactly `total` (integer fils), keeping
 * the proportions: a no-op when it already does (the normal case), otherwise
 * a largest-remainder rescale, or an even split when every part is 0.
 * Used after a free-shipping coupon waives some vendors' delivery.
 */
export function reconcileVendorShipping(
  byVendor: Record<string, number>,
  total: number,
): Record<string, number> {
  const ids = Object.keys(byVendor);
  const target = Math.max(0, Math.round(total));
  if (ids.length === 0) return {};
  const parts = ids.map((id) => Math.max(0, Math.round(byVendor[id] ?? 0)));
  const sum = parts.reduce((s, p) => s + p, 0);
  if (sum === target) return Object.fromEntries(ids.map((id, i) => [id, parts[i] ?? 0]));
  const weights = sum > 0 ? parts : ids.map(() => 1);
  const wsum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / wsum) * target);
  const out = raw.map((r) => Math.floor(r));
  let left = target - out.reduce((s, p) => s + p, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) {
    const idx = order[k]?.i ?? 0;
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return Object.fromEntries(ids.map((id, i) => [id, out[i] ?? 0]));
}
