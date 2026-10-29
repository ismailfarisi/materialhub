// strike.service.ts
//
// Phase 5 Task 5 (spec §5.3 no-show strikes). No-show "strikes" are DERIVED,
// never stored: a customer's strike count at a vendor is exactly
//   count(bookings WHERE customer_user_id=... AND vendor_id=... AND status='no_show')
// and their platform-wide count is the same without the vendor filter. No new
// column / migration (per the platform constraint) — every gate re-counts live.
//
// The gate: pay_at_venue is revoked for a customer AT a vendor once their
// per-vendor count reaches the per-vendor threshold (config default 3), and
// revoked EVERYWHERE once their platform-wide count reaches the higher platform
// backstop (config default 8) — so a serial no-shower who spreads thin across
// many vendors (never hitting any single vendor's threshold) is still caught.
// Wired into BookingService.checkPayAtVenueAllowed (the seam Phase 4 Task 5
// left), which drives BOTH create()'s hard 422 `pay_at_venue_unavailable` and
// hold()'s informational `allowed_payment_modes`.
import { type Booking, BookingStatus } from "@materialhub/database";
import type { Repository } from "typeorm";

export interface PayAtVenueGateResult {
  blocked: boolean;
  reason?: string;
  vendorCount: number;
  platformCount: number;
}

export class StrikeService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly vendorThreshold: number,
    private readonly platformThreshold: number,
  ) {}

  /**
   * The customer's DERIVED no-show count. Scoped to `vendorId` when supplied
   * (per-vendor strikes); platform-wide (across all vendors) when omitted.
   * A plain COUNT — soft-deleted bookings are excluded automatically by
   * TypeORM's default deleted_at IS NULL predicate on the repo.
   */
  async customerNoShowCount(userId: string, vendorId?: string): Promise<number> {
    return this.bookingRepo.count({
      where: {
        customer_user_id: userId,
        status: BookingStatus.no_show,
        ...(vendorId ? { vendor_id: vendorId } : {}),
      },
    });
  }

  /**
   * Whether pay_at_venue must be revoked for this customer at this vendor.
   * Blocked when EITHER the per-vendor count has reached the per-vendor
   * threshold OR the platform-wide count has reached the platform backstop.
   * Returns both raw counts so callers/logs can explain the decision.
   */
  async checkPayAtVenue(userId: string, vendorId: string): Promise<PayAtVenueGateResult> {
    const [vendorCount, platformCount] = await Promise.all([
      this.customerNoShowCount(userId, vendorId),
      this.customerNoShowCount(userId),
    ]);

    const vendorBlocked = vendorCount >= this.vendorThreshold;
    const platformBlocked = platformCount >= this.platformThreshold;
    const blocked = vendorBlocked || platformBlocked;

    let reason: string | undefined;
    if (platformBlocked) {
      reason = `platform no-show limit reached (${platformCount} ≥ ${this.platformThreshold})`;
    } else if (vendorBlocked) {
      reason = `vendor no-show limit reached (${vendorCount} ≥ ${this.vendorThreshold})`;
    }

    return { blocked, reason, vendorCount, platformCount };
  }
}
