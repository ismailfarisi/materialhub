import { config } from "@materialhub/config";
// review-rating.job.ts
import { Queue, Worker } from "bullmq";
import type { Repository } from "typeorm";

export const REVIEW_RATING_QUEUE = "review-rating";

export interface ReviewRatingJob {
  reviewId: string;
  productId: string;
  vendorId: string;
}

let reviewRatingQueue: Queue | null = null;

export function getReviewRatingQueue(): Queue {
  if (!reviewRatingQueue) {
    reviewRatingQueue = new Queue(REVIEW_RATING_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return reviewRatingQueue;
}

// Extracted from the Worker processor so the aggregation math is unit-testable
// without a BullMQ/Redis connection (Phase 5 Task 7 follow-up).
export async function recomputeReviewRatings(
  // biome-ignore lint/suspicious/noExplicitAny: loosely-typed repos (pre-existing worker signature)
  reviewRepo: Repository<any>,
  // biome-ignore lint/suspicious/noExplicitAny: loosely-typed repos (pre-existing worker signature)
  productRepo: Repository<any>,
  // biome-ignore lint/suspicious/noExplicitAny: loosely-typed repos (pre-existing worker signature)
  vendorRepo: Repository<any>,
  { productId, vendorId }: Pick<ReviewRatingJob, "productId" | "vendorId">,
): Promise<void> {
  // Product aggregate — product reviews only (unchanged behavior).
  const productResult = await reviewRepo
    .createQueryBuilder("r")
    .select("AVG(r.rating)", "avg")
    .addSelect("COUNT(*)", "count")
    .where("r.product_id = :productId", { productId })
    .andWhere("r.status = :status", { status: "approved" })
    .andWhere("r.deleted_at IS NULL")
    .getRawOne();

  await productRepo.update(productId, {
    rating_avg: Number.parseFloat(productResult?.avg || "0").toFixed(2),
    rating_count: Number.parseInt(productResult?.count || "0", 10),
  });

  // Vendor aggregate — BLENDED across product `reviews` AND booking-service's
  // `service_reviews` (Phase 5 Task 7). A vendor's rating_avg has TWO writers:
  // this worker (on product-review approval) and booking-service's
  // ServiceReviewRatingService (on booking-review creation). Both must run the
  // SAME blended UNION with identical status ('approved') + soft-delete
  // predicates, or whichever fires last silently drops the other source (a
  // product-only recompute here would erase the service-review component for
  // any vendor with both product and booking reviews).
  // KEEP IN SYNC with apps/booking-service/src/domain/reviews/
  // service-review-rating.service.ts's recomputeVendor.
  // status::text on both arms — the two tables use DIFFERENT Postgres enum
  // types (product `review_status` vs `service_reviews_status_enum`), so a
  // single shared $2 parameter can't be inferred against both (42883); the
  // text cast makes the comparison type-uniform.
  const vendorResult = await reviewRepo.query(
    `SELECT AVG(rating)::numeric AS avg, COUNT(*)::int AS count FROM (
       SELECT rating FROM reviews WHERE vendor_id = $1 AND status::text = $2 AND deleted_at IS NULL
       UNION ALL
       SELECT rating FROM service_reviews WHERE vendor_id = $1 AND status::text = $2 AND deleted_at IS NULL
     ) combined`,
    [vendorId, "approved"],
  );

  await vendorRepo.update(vendorId, {
    rating_avg: Number.parseFloat(vendorResult?.[0]?.avg || "0").toFixed(2),
    rating_count: Number.parseInt(String(vendorResult?.[0]?.count ?? "0"), 10),
  });
}

export function createReviewRatingWorker(
  // biome-ignore lint/suspicious/noExplicitAny: loosely-typed repos (pre-existing worker signature)
  reviewRepo: Repository<any>,
  // biome-ignore lint/suspicious/noExplicitAny: loosely-typed repos (pre-existing worker signature)
  productRepo: Repository<any>,
  // biome-ignore lint/suspicious/noExplicitAny: loosely-typed repos (pre-existing worker signature)
  vendorRepo: Repository<any>,
): Worker {
  return new Worker(
    REVIEW_RATING_QUEUE,
    async (job) => {
      const { productId, vendorId } = job.data as ReviewRatingJob;
      await recomputeReviewRatings(reviewRepo, productRepo, vendorRepo, { productId, vendorId });
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 1,
    },
  );
}
