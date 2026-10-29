export interface OfferingRating {
  avg: number;
  count: number;
}

export type RatingsRow = { service_offering_id: string; avg: string; count: string };

export interface RatingsDeps {
  runQuery: (offeringIds: string[]) => Promise<RatingsRow[]>;
}

// status::text — same posture as booking-service's
// ServiceReviewRatingService.recomputeVendor (service-review-rating.service.ts):
// a moderator rejecting/flagging a review must not keep contributing to the
// public rating shown on /services or to the min_rating filter. The cast is
// needed because `service_reviews.status` is its own Postgres enum type
// (service_reviews_status_enum); comparing it to a plain string parameter
// without the cast risks a 42883 type-inference error on some drivers.
//
// `service_reviews` has NO `service_offering_id` column of its own — a
// review is keyed by `booking_id`, and the offering is a nullable column on
// `bookings` (nullable because Phase 6 walk-in/phone bookings can have no
// offering picked). So the aggregate must join through bookings and group on
// `b.service_offering_id`. `b.deleted_at IS NULL` is included alongside
// `r.deleted_at IS NULL`: a soft-deleted booking is treated the same as a
// soft-deleted review — its review should stop contributing to the public
// rating shown on /services.
export const defaultRatingsDeps: RatingsDeps = {
  runQuery: async (offeringIds: string[]) => {
    const { AppDataSource, ServiceReviewStatus } = await import("@materialhub/database");
    return AppDataSource.query(
      `SELECT b.service_offering_id AS service_offering_id,
              AVG(r.rating)::numeric(3,2) AS avg,
              COUNT(*) AS count
         FROM service_reviews r
         JOIN bookings b ON b.id = r.booking_id
        WHERE b.service_offering_id = ANY($1)
          AND r.status::text = $2
          AND r.deleted_at IS NULL
          AND b.deleted_at IS NULL
        GROUP BY b.service_offering_id`,
      [offeringIds, ServiceReviewStatus.approved],
    );
  },
};

/**
 * Aggregate review scores for a batch of offerings. Shared by the incremental
 * sync (service-search-sync.job.ts) and the full reindex
 * (service-search-reindex.service.ts) so the two can never disagree.
 */
export async function loadRatings(
  offeringIds: string[],
  deps: RatingsDeps = defaultRatingsDeps,
): Promise<Map<string, OfferingRating>> {
  const map = new Map<string, OfferingRating>();
  if (offeringIds.length === 0) return map;
  const rows = await deps.runQuery(offeringIds);
  for (const r of rows) {
    map.set(r.service_offering_id, { avg: Number(r.avg), count: Number(r.count) });
  }
  return map;
}
