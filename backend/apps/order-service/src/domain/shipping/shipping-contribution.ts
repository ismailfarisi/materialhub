// shipping-contribution.ts
// Pure resolver for the vendor shipping contribution (Schedule A). Given a
// vendor sub-order subtotal (fils) and the candidate tier rows (global +
// optionally the vendor's overrides), returns what the vendor pays — the
// configured amount for the band whose `min_order_value` is the greatest value
// not exceeding the subtotal. The top band's amount is the de-facto cap.

export type ContributionTierRow = {
  vendor_id: string | null;
  min_order_value: number;
  vendor_contribution: number;
  is_active: boolean;
};

export function resolveShippingContribution(
  subtotalFils: number,
  tiers: ContributionTierRow[],
  vendorId: string,
): number {
  const active = tiers.filter((t) => t.is_active);
  const vendorRows = active.filter((t) => t.vendor_id === vendorId);
  // Vendor override rows fully supersede global when the vendor has any.
  const scope = vendorRows.length > 0 ? vendorRows : active.filter((t) => t.vendor_id === null);

  const eligible = scope.filter((t) => t.min_order_value <= subtotalFils);
  if (eligible.length === 0) return 0;

  return eligible.reduce((best, t) => (t.min_order_value > best.min_order_value ? t : best))
    .vendor_contribution;
}
