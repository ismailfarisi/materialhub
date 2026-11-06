// sample-shipping.ts
// Samples ship at a flat, admin-set rate. When everything a supplier ships in
// an order is samples, each of that supplier's shipping methods costs at most
// the sample rate. A supplier with any regular line ships at its normal rates.

export interface SampleAwareItem {
  vendor_id: string;
  is_sample?: boolean;
}

export interface SampleShippingRule {
  /** Suppliers whose lines in this cart are all samples. */
  vendorIds: Set<string>;
  /** Cap per shipping method for those suppliers, in fils. */
  rateFils: number;
}

export function sampleOnlyVendorIds(items: readonly SampleAwareItem[]): Set<string> {
  const regular = new Set<string>();
  const sample = new Set<string>();
  for (const it of items) (it.is_sample ? sample : regular).add(it.vendor_id);
  for (const v of regular) sample.delete(v);
  return sample;
}

export function sampleShippingRule(
  items: readonly SampleAwareItem[],
  rateFils: number,
): SampleShippingRule | undefined {
  const vendorIds = sampleOnlyVendorIds(items);
  return vendorIds.size > 0
    ? { vendorIds, rateFils: Math.max(0, Math.trunc(rateFils)) }
    : undefined;
}

/** Price of one shipping method for a supplier, after the sample cap. */
export function capForSamples(
  priceFils: number,
  vendorId: string,
  rule: SampleShippingRule | undefined,
): number {
  if (!rule || !rule.vendorIds.has(vendorId)) return priceFils;
  return Math.min(priceFils, rule.rateFils);
}
