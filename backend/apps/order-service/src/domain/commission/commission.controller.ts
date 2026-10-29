// commission.controller.ts
import type { CommissionService } from "./commission.service.ts";
import type { PayoutService } from "./payout.service.ts";

/**
 * `carrier_cost_total` is the platform's own shipping cost basis (the
 * configured base carrier rate, frozen per shipment) — never the vendor's.
 * It sits in the same payload as `shipping_contribution_total` (what the
 * vendor was actually charged), so leaving it on a vendor-authenticated
 * response would let any vendor derive the platform's exact per-shipment
 * margin. Admins still see it via AdminPayoutController, which does not use
 * this helper. `computePayoutTotals`'s return type is untouched — this only
 * projects the vendor-facing HTTP responses.
 */
function omitCarrierCostTotal<T extends { carrier_cost_total?: unknown }>(
  value: T,
): Omit<T, "carrier_cost_total"> {
  const { carrier_cost_total: _carrier_cost_total, ...rest } = value;
  return rest;
}

export class CommissionController {
  constructor(
    private commissionService: CommissionService,
    private payoutService: PayoutService,
  ) {}

  listCommissions(query: any) {
    return this.commissionService.listForAdmin(query);
  }

  getCommissionConfig() {
    return this.commissionService.getCommissionConfig();
  }

  async listVendorPayouts(vendorId: string, query: any) {
    const { data, total } = await this.payoutService.listForVendor(vendorId, query);
    return { data: data.map((payout) => omitCarrierCostTotal(payout as any)), total };
  }

  updateVendorRate(vendorId: string, body: any) {
    return this.commissionService.updateVendorRate(vendorId, body);
  }

  getGlobalRate() {
    return this.commissionService.getGlobalDefaultRate();
  }

  setGlobalRate(rate: number) {
    return this.commissionService.setGlobalDefaultRate(rate);
  }

  async estimatePayout(vendorId: string) {
    const totals = await this.payoutService.estimateForVendor(vendorId);
    return omitCarrierCostTotal(totals);
  }

  backfillCommissions(orderId: string, opts?: { recalculate?: boolean }) {
    return this.commissionService.backfillCommissionsForOrder(orderId, opts);
  }
}
