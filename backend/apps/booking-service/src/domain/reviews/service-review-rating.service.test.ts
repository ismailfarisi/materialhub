// service-review-rating.service.test.ts
//
// Mocked-repo unit tests (no live DB) for the AVG/COUNT parsing + write shape:
// the staff aggregate scoped to service_reviews only, and the vendor aggregate
// blended across `reviews` (product) UNION `service_reviews` (booking) — see
// the module doc for why the vendor side must blend both tables. Real SQL
// correctness (the UNION actually blends, the partial-index-friendly filters)
// is covered by the live-DB integration suite.
import { describe, expect, it, mock } from "bun:test";
import { ServiceReviewRatingService, parseAggregate } from "./service-review-rating.service.ts";

function makeService(queryImpl: (sql: string, params?: unknown[]) => Promise<any[]>) {
  const staffRepo = { update: mock(async (_id: string, _patch: Record<string, unknown>) => {}) };
  const vendorRepo = { update: mock(async (_id: string, _patch: Record<string, unknown>) => {}) };
  const query = mock(queryImpl);
  const service = new ServiceReviewRatingService(staffRepo as any, vendorRepo as any, query as any);
  return { service, staffRepo, vendorRepo, query };
}

describe("ServiceReviewRatingService.recompute", () => {
  it("writes the staff aggregate scoped to service_reviews only", async () => {
    const { service, staffRepo, query } = makeService(async (sql: string) => {
      if (sql.includes("FROM service_reviews") && !sql.includes("UNION")) {
        return [{ avg: "4.6667", count: 3 }];
      }
      return [{ avg: "4.5", count: 5 }];
    });

    await service.recompute({ vendorId: "vendor-1", staffMemberId: "staff-1" });

    expect(staffRepo.update).toHaveBeenCalledTimes(1);
    const [id, patch] = staffRepo.update.mock.calls[0]!;
    expect(id).toBe("staff-1");
    expect(patch).toEqual({ rating: 4.67, rating_count: 3 });

    const staffCall = query.mock.calls.find(
      ([sql]) => sql.includes("FROM service_reviews") && !sql.includes("UNION"),
    );
    expect(staffCall?.[1]).toEqual(["staff-1", "approved"]);
  });

  it("writes the vendor aggregate via the blended UNION query, params scoped to vendor_id", async () => {
    const { service, vendorRepo, query } = makeService(async (sql: string) => {
      if (sql.includes("UNION ALL")) return [{ avg: "4.0", count: 10 }];
      return [{ avg: "5.0", count: 1 }];
    });

    await service.recompute({ vendorId: "vendor-1", staffMemberId: "staff-1" });

    expect(vendorRepo.update).toHaveBeenCalledTimes(1);
    const [id, patch] = vendorRepo.update.mock.calls[0]!;
    expect(id).toBe("vendor-1");
    expect(patch).toEqual({ rating_avg: 4, rating_count: 10 });

    const vendorCall = query.mock.calls.find(([sql]) => sql.includes("UNION ALL"));
    expect(vendorCall?.[0]).toContain("FROM reviews");
    expect(vendorCall?.[0]).toContain("FROM service_reviews");
    expect(vendorCall?.[1]).toEqual(["vendor-1", "approved"]);
  });

  it("defaults to 0/0 when the aggregate has no rows yet", async () => {
    const { service, staffRepo, vendorRepo } = makeService(async () => [{ avg: null, count: 0 }]);

    await service.recompute({ vendorId: "vendor-1", staffMemberId: "staff-1" });

    expect(staffRepo.update.mock.calls[0]![1]).toEqual({ rating: 0, rating_count: 0 });
    expect(vendorRepo.update.mock.calls[0]![1]).toEqual({ rating_avg: 0, rating_count: 0 });
  });
});

// Phase 7 review, finding 8. SQL AVG() over zero rows is NULL — e.g. every
// review for a staff member soft-deleted, or a future moderation action
// flipping them all off `approved`. The parser used to collapse that NULL to a
// numeric 0, which is indistinguishable from a genuine 0-star average to
// anything sorting/filtering on `rating` without also reading `rating_count`.
// It now returns `null`, so "no ratings" is a distinct value in code and the
// 0 that still reaches the DB is a single, documented, one-line coercion (the
// columns are `numeric NOT NULL DEFAULT 0`; writing a true NULL needs a
// migration — see NO_REVIEWS_RATING).
describe("parseAggregate (no-rows case)", () => {
  it("returns avg: null (NOT 0) when AVG() came back NULL", () => {
    expect(parseAggregate([{ avg: null, count: 0 }])).toEqual({ avg: null, count: 0 });
  });

  it("returns avg: null for a completely empty result set", () => {
    expect(parseAggregate([])).toEqual({ avg: null, count: 0 });
  });

  it("still parses a real aggregate, rounded to 2dp", () => {
    expect(parseAggregate([{ avg: "4.6667", count: 3 }])).toEqual({ avg: 4.67, count: 3 });
  });

  it("a genuine avg of 0 is impossible (rating is 1..5) but is NOT confused with null when it appears", () => {
    expect(parseAggregate([{ avg: "0", count: 2 }])).toEqual({ avg: 0, count: 2 });
  });
});
