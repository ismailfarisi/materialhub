// review-rating.job.test.ts
//
// Mocked-repo unit tests (no live DB / Redis / BullMQ) for
// recomputeReviewRatings — the aggregation math the review-rating worker runs
// on product-review approval. Focus (Phase 5 Task 7 follow-up): the vendor
// aggregate is now BLENDED across product `reviews` UNION booking-service's
// `service_reviews` with identical status/soft-delete predicates, mirroring
// booking-service's ServiceReviewRatingService.recomputeVendor, so both
// writers of vendors.rating_avg converge on the same value regardless of
// which review event fires last. The product aggregate is unchanged
// (product reviews only).
import { describe, expect, it, mock } from "bun:test";
import { recomputeReviewRatings } from "./review-rating.job.ts";

function makeRepos(
  opts: {
    productAggregate?: { avg: string | null; count: string | number | null } | undefined;
    vendorAggregate?: Array<{ avg: string | null; count: string | number | null }>;
  } = {},
) {
  const productAggregate =
    opts.productAggregate === undefined ? { avg: "4.0", count: "2" } : opts.productAggregate;
  const vendorAggregate = opts.vendorAggregate ?? [{ avg: "4.0", count: 2 }];

  const getRawOne = mock(async () => productAggregate);
  const qb: Record<string, unknown> = {};
  for (const m of ["select", "addSelect", "where", "andWhere"]) {
    qb[m] = mock(() => qb);
  }
  qb.getRawOne = getRawOne;

  const query = mock(async () => vendorAggregate);
  const reviewRepo = { createQueryBuilder: mock(() => qb), query };
  const productRepo = { update: mock(async () => {}) };
  const vendorRepo = { update: mock(async () => {}) };

  return { reviewRepo, productRepo, vendorRepo, qb, query };
}

const IDS = { productId: "product-1", vendorId: "vendor-1" };

describe("recomputeReviewRatings", () => {
  it("product aggregate is unchanged: product reviews only, approved-filtered, written to the product", async () => {
    const { reviewRepo, productRepo, vendorRepo, qb } = makeRepos({
      productAggregate: { avg: "4.3333", count: "3" },
    });

    await recomputeReviewRatings(reviewRepo as any, productRepo as any, vendorRepo as any, IDS);

    expect(productRepo.update).toHaveBeenCalledTimes(1);
    const [id, patch] = productRepo.update.mock.calls[0] as unknown as [string, any];
    expect(id).toBe("product-1");
    expect(patch).toEqual({ rating_avg: "4.33", rating_count: 3 });

    // Approved-only + product-scoped predicates preserved.
    const andWhereArgs = (qb.andWhere as any).mock.calls.map((c: unknown[]) => c[0]);
    expect(andWhereArgs).toContain("r.status = :status");
    expect(andWhereArgs).toContain("r.deleted_at IS NULL");
  });

  it("vendor aggregate blends reviews UNION service_reviews with identical approved + soft-delete predicates (mixed vendor converges)", async () => {
    // A vendor with 1 product review (5) and 3 service reviews (4,4,4): the
    // blended DB aggregate is AVG=4.25, COUNT=4 — the worker must write that,
    // not a product-only AVG=5/COUNT=1.
    const { reviewRepo, productRepo, vendorRepo, query } = makeRepos({
      vendorAggregate: [{ avg: "4.2500", count: 4 }],
    });

    await recomputeReviewRatings(reviewRepo as any, productRepo as any, vendorRepo as any, IDS);

    expect(vendorRepo.update).toHaveBeenCalledTimes(1);
    const [id, patch] = vendorRepo.update.mock.calls[0] as unknown as [string, any];
    expect(id).toBe("vendor-1");
    expect(patch).toEqual({ rating_avg: "4.25", rating_count: 4 });

    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("FROM reviews");
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("FROM service_reviews");
    // Identical predicates on BOTH sources: status param + soft-delete.
    expect(sql.match(/status::text = \$2/g)?.length).toBe(2);
    expect(sql.match(/deleted_at IS NULL/g)?.length).toBe(2);
    expect(sql.match(/vendor_id = \$1/g)?.length).toBe(2);
    expect(params).toEqual(["vendor-1", "approved"]);
  });

  it("product-only vendor: the blended aggregate degenerates to the product-only value (unchanged behavior)", async () => {
    // With zero service_reviews rows the UNION arm contributes nothing, so
    // the DB aggregate equals the old product-only recompute — written as-is.
    const { reviewRepo, productRepo, vendorRepo } = makeRepos({
      vendorAggregate: [{ avg: "3.6667", count: 3 }],
    });

    await recomputeReviewRatings(reviewRepo as any, productRepo as any, vendorRepo as any, IDS);

    const [, patch] = vendorRepo.update.mock.calls[0] as unknown as [string, any];
    expect(patch).toEqual({ rating_avg: "3.67", rating_count: 3 });
  });

  it("zero-review edge: null aggregates write 0.00 / 0 on both product and vendor", async () => {
    const { reviewRepo, productRepo, vendorRepo } = makeRepos({
      productAggregate: { avg: null, count: null },
      vendorAggregate: [{ avg: null, count: 0 }],
    });

    await recomputeReviewRatings(reviewRepo as any, productRepo as any, vendorRepo as any, IDS);

    const [, productPatch] = productRepo.update.mock.calls[0] as unknown as [string, any];
    const [, vendorPatch] = vendorRepo.update.mock.calls[0] as unknown as [string, any];
    expect(productPatch).toEqual({ rating_avg: "0.00", rating_count: 0 });
    expect(vendorPatch).toEqual({ rating_avg: "0.00", rating_count: 0 });
  });
});
