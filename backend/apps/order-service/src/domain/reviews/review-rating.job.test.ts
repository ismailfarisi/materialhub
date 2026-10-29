// review-rating.job.test.ts
//
// Mocked-repo unit tests (no live DB / Redis / BullMQ) for
// recomputeReviewRatings — the aggregation math the review-rating worker runs
// on product-review approval. The product aggregate is scoped to the product;
// the vendor aggregate spans every approved product review for the vendor,
// with identical status/soft-delete predicates.
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

  it("vendor aggregate spans the vendor's approved product reviews with approved + soft-delete predicates", async () => {
    // A vendor with four approved reviews (5,4,4,4) across its products: the
    // DB aggregate is AVG=4.25, COUNT=4 — the worker must write that as-is.
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
    expect(sql).not.toContain("UNION");
    // Same predicates as the product aggregate: status param + soft-delete.
    expect(sql).toMatch(/status::text = \$2/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/vendor_id = \$1/);
    expect(params).toEqual(["vendor-1", "approved"]);
  });

  it("writes the vendor aggregate exactly as the DB reports it", async () => {
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
