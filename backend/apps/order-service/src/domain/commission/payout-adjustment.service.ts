// payout-adjustment.service.ts
import type { VendorPayoutAdjustment } from "@materialhub/database";
import { IsNull, type Repository } from "typeorm";

/**
 * Reads and manual writes over the vendor_payout_adjustments ledger.
 *
 * Automatic rows (source_type "return" | "dispute" | "item_cancellation")
 * are written by their respective flows; this service only ever writes
 * source_type "manual" rows, for off-system corrections an admin applies
 * by hand. Every row here is netted into the next draft payout that claims
 * it via settled_payout_id (see payout.service.ts).
 */
export class PayoutAdjustmentService {
  constructor(private adjustmentRepo: Repository<VendorPayoutAdjustment>) {}

  async listForVendor(
    vendorId: string,
    query: { page?: number; limit?: number; unsettledOnly?: boolean },
  ): Promise<{ items: VendorPayoutAdjustment[]; total: number }> {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const limit = query.limit || 20;
    const where: any = { vendor_id: vendorId };
    if (query.unsettledOnly) where.settled_payout_id = IsNull();
    const [items, total] = await this.adjustmentRepo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async listForPayout(payoutId: string): Promise<VendorPayoutAdjustment[]> {
    return this.adjustmentRepo.find({
      where: { settled_payout_id: payoutId } as any,
      order: { created_at: "ASC" },
    });
  }

  async create(input: {
    vendorId: string;
    amountFils: number;
    reason: string;
    adminUserId: string;
  }): Promise<VendorPayoutAdjustment> {
    // amount_fils has a non-zero CHECK constraint at the DB level; reject
    // here so a zero surfaces as a clean 400 instead of a raw constraint
    // violation bubbling up as an unhandled 500.
    if (!Number.isInteger(input.amountFils) || input.amountFils === 0) {
      throw new Error("amount_fils must be a non-zero integer");
    }
    // `create` is overloaded; the object literal resolves to the array overload
    // unless the single-entity result type is pinned, which then makes `save`
    // return VendorPayoutAdjustment[] and break this method's return type.
    const row = this.adjustmentRepo.create({
      vendor_id: input.vendorId,
      amount_fils: input.amountFils,
      reason: input.reason,
      source_type: "manual",
      source_id: null,
      created_by: input.adminUserId,
    } as any) as unknown as VendorPayoutAdjustment;
    return this.adjustmentRepo.save(row);
  }
}
