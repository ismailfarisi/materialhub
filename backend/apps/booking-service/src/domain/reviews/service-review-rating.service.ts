// service-review-rating.service.ts
//
// Phase 5 Task 7 (spec §4.3/§7 "Feeds staff_member.rating + vendor rating_avg
// via the existing review-rating worker pattern"). Recompute-from-aggregate
// (AVG over approved reviews), mirroring order-service's
// apps/order-service/src/domain/reviews/review-rating.job.ts — but implemented
// as a directly-callable class here (no BullMQ queue/worker) rather than the
// enqueue-then-async-worker shape that job uses. Two reasons:
//   1. order-service's worker is a Review/Product/Vendor-specific BullMQ
//      consumer — it can't take a ServiceReview payload (different job shape,
//      different tables), so a straight "reuse" wasn't possible; this is the
//      brief's "parallel worker" fallback.
//   2. Booking reviews are created already `approved` (see
//      service-review.service.ts's module doc), and the brief's live-DB test
//      requires ratings to be visibly updated immediately after a review is
//      created — an async queue hop would make that assertion racy. A plain
//      awaited call keeps the effect synchronous with create(), same as this
//      module's caller expects.
//
// ── staff_member.rating: straightforward — only service_reviews writes it. ──
//
// ── vendor.rating_avg: SHARED with product reviews ──────────────────────────
// order-service's review-rating.job.ts ALSO writes `vendors.rating_avg`, from
// the product-catalog `reviews` table. A naive service_reviews-only recompute
// here would clobber that (a vendor selling both products and bookable
// services would flip-flop between a product-only and a service-only average
// depending on which side last wrote). Recompute is done here as a BLENDED
// aggregate across both `reviews` and `service_reviews` (UNION ALL, one
// physical Postgres instance/schema — booking-service already reads
// Vendor/Category/SiteSetting directly across the service boundary, see
// commission-snapshot.service.ts's doc comment for the same precedent).
//
// KEEP IN SYNC (both sides now blend): as of commit 494664a6,
// order-service's review-rating.job.ts (recomputeReviewRatings) ALSO recomputes
// `vendors.rating_avg` as the SAME blended UNION over product `reviews` +
// `service_reviews`, with identical status='approved' + deleted_at IS NULL
// predicates — so a product-review approval no longer clobbers the
// service-review component (the drift this class's blend was originally added
// to work around). The two recomputes are now mirror images: whichever review
// (product or booking) last changes recomputes the SAME blended average, so
// they converge instead of flip-flopping. Any change to the blend's predicates
// here MUST be mirrored in order-service's recomputeReviewRatings (and vice
// versa) or the two writers desync again.
import { ServiceReviewStatus, type StaffMember, type Vendor } from "@materialhub/database";
import type { Repository } from "typeorm";

export type RawAggregateQuery = (
  sql: string,
  params?: unknown[],
) => Promise<Array<{ avg: string | null; count: string | number | null }>>;

export interface RecomputeRatingsInput {
  vendorId: string;
  staffMemberId: string;
}

// Phase 7 review (finding 8): SQL `AVG()` over ZERO rows returns NULL, and
// the previous `?? "0"` collapsed that to a written `0` — indistinguishable
// from a genuine 0-star average to anything that sorts/filters on `rating`
// without also reading `rating_count`. `avg` is now explicitly `null` for the
// no-rows case so the caller decides, rather than the parser silently
// inventing a rating. (A NULL `avg` and `count === 0` always travel together:
// AVG is only NULL when no rows matched.)
export function parseAggregate(
  rows: Array<{ avg: string | null; count: string | number | null }>,
): {
  avg: number | null;
  count: number;
} {
  const row = rows[0];
  const count = Number.parseInt(String(row?.count ?? "0"), 10) || 0;
  const parsed = row?.avg == null ? Number.NaN : Number.parseFloat(row.avg);
  const avg = Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
  return { avg, count };
}

// `staff_members.rating` and `vendors.rating_avg` are both `numeric NOT NULL
// DEFAULT 0` (1782100000000-CreateBookingScheduling.ts / InitialSchema), so a
// true NULL cannot be written without a migration — which is out of scope for
// this fix (see the report). Until the columns are made nullable, "no reviews"
// is written as the 0/0 pair, which IS unambiguous when read together:
// ratings are constrained to 1..5, so `rating_count = 0` is the only way
// `rating` can be 0. The `null` above keeps that decision explicit and in ONE
// place, so flipping to a real NULL is a one-line change here once the columns
// allow it.
const NO_REVIEWS_RATING = 0;

export class ServiceReviewRatingService {
  constructor(
    private readonly staffRepo: Repository<StaffMember>,
    private readonly vendorRepo: Repository<Vendor>,
    private readonly query: RawAggregateQuery,
  ) {}

  async recompute(input: RecomputeRatingsInput): Promise<void> {
    await Promise.all([
      this.recomputeStaff(input.staffMemberId),
      this.recomputeVendor(input.vendorId),
    ]);
  }

  private async recomputeStaff(staffMemberId: string): Promise<void> {
    const rows = await this.query(
      `SELECT AVG(rating)::numeric AS avg, COUNT(*)::int AS count
       FROM service_reviews
       WHERE staff_member_id = $1 AND status = $2 AND deleted_at IS NULL`,
      [staffMemberId, ServiceReviewStatus.approved],
    );
    const { avg, count } = parseAggregate(rows);
    await this.staffRepo.update(staffMemberId, {
      rating: avg ?? NO_REVIEWS_RATING,
      rating_count: count,
    });
  }

  private async recomputeVendor(vendorId: string): Promise<void> {
    // KEEP IN SYNC with order-service's recomputeVendorRating
    // (apps/order-service/src/domain/reviews/review-rating.job.ts) — both
    // writers of vendors.rating_avg run this same blended UNION so they
    // converge on the same value regardless of which review event fires last.
    // status::text on both arms — the two tables use DIFFERENT Postgres enum
    // types (product `review_status` vs `service_reviews_status_enum`), so a
    // single shared $2 parameter can't be inferred against both (42883
    // "operator does not exist: service_reviews_status_enum = review_status");
    // the text cast makes the comparison type-uniform.
    const rows = await this.query(
      `SELECT AVG(rating)::numeric AS avg, COUNT(*)::int AS count FROM (
         SELECT rating FROM reviews WHERE vendor_id = $1 AND status::text = $2 AND deleted_at IS NULL
         UNION ALL
         SELECT rating FROM service_reviews WHERE vendor_id = $1 AND status::text = $2 AND deleted_at IS NULL
       ) combined`,
      [vendorId, ServiceReviewStatus.approved],
    );
    const { avg, count } = parseAggregate(rows);
    await this.vendorRepo.update(vendorId, {
      rating_avg: avg ?? NO_REVIEWS_RATING,
      rating_count: count,
    });
  }
}
