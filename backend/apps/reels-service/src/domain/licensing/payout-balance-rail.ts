import { AppDataSource, ReelLicenseFundingSource } from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
import type { FundingRail, HoldInput, HoldResult } from "./funding-rail.ts";

/**
 * Reserves against the vendor's accrued-but-unpaid earnings. Availability =
 *   SUM(commissions.vendor_earning WHERE vendor_id AND status='pending'
 *       AND payout_id IS NULL AND deleted_at IS NULL)
 *   - SUM(active payout-balance holds: status IN ('held','captured') AND settled_payout_id IS NULL)
 *
 * R4 (payout correctness): `payout_id IS NULL` is part of the payable
 * predicate everywhere else and was missing here - the structurally identical
 * sibling of getAdminSummary.total_pending_fils. Without it a vendor could
 * license a reel against earnings a draft payout had already claimed and was
 * about to transfer: the same fils spent twice. The two sides stay consistent
 * because a draft claims the holds at the same moment it claims the
 * commissions (createDraft), so a claimed hold leaves the subtrahend exactly
 * as its commissions leave the sum.
 * A `held` row IS the reservation; capture flips it to `captured` (still subtracted
 * from availability until a vendor payout settles it — see order-service payout.service).
 */
export class PayoutBalanceRail implements FundingRail {
  readonly source = ReelLicenseFundingSource.payout_balance;

  async availableFils(vendorId: string, manager = AppDataSource.manager): Promise<number> {
    const earned: { v: string | null }[] = await manager.query(
      `SELECT COALESCE(SUM(vendor_earning),0)::text AS v
         FROM commissions
        WHERE vendor_id = $1 AND status = 'pending'
          AND payout_id IS NULL AND deleted_at IS NULL`,
      [vendorId],
    );
    const held: { v: string | null }[] = await manager.query(
      `SELECT COALESCE(SUM(amount_fils),0)::text AS v
         FROM reel_license_escrow_holds
        WHERE vendor_id = $1 AND funding_source = 'payout_balance'
          AND status IN ('held','captured') AND settled_payout_id IS NULL AND deleted_at IS NULL`,
      [vendorId],
    );
    return Number(earned[0]?.v ?? 0) - Number(held[0]?.v ?? 0);
  }

  async hold(input: HoldInput): Promise<HoldResult> {
    // Lock the vendor's pending commission rows so a concurrent offer can't
    // double-spend the same balance. SELECT FOR UPDATE on the commissions set.
    await input.manager.query(
      `SELECT id FROM commissions
         WHERE vendor_id = $1 AND status = 'pending'
           AND payout_id IS NULL AND deleted_at IS NULL
         FOR UPDATE`,
      [input.vendorId],
    );
    const available = await this.availableFils(input.vendorId, input.manager);
    if (available < input.amountFils) {
      throw new BadRequestError(`insufficient_payout_balance:${available}`);
    }
    // The hold row is written by LicensingService; reservation is implicit via the row.
    return {
      funding_source: this.source,
      amount_fils: input.amountFils,
      stripe_payment_intent_id: null,
      idempotency_key: input.idempotencyKey,
    };
  }

  // Capture is a no-op on the rail side: the hold row flip to 'captured' (done by
  // LicensingService) keeps it subtracted from availability until a payout settles it.
  async capture(): Promise<void> {}
  // Release is a no-op on the rail side: LicensingService flips the row to 'released'.
  async release(): Promise<void> {}
}
