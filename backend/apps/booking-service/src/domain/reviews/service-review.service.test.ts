// service-review.service.test.ts
//
// Mocked-repo unit tests (no live DB) for the review gate + branching: the
// ownership scope, the completed-only 403, the pre-check + 23505-race-backstop
// 409 on create(), the vendor-ownership 404 + already-replied 409 on
// vendorReply(), and that a successful create() calls the rating recomputer
// with the booking's vendor/staff ids. Real DB unique-index/ratings behaviour
// is covered by the live-DB integration suite.
import { describe, expect, it, mock } from "bun:test";
import { BookingStatus, ServiceReviewStatus } from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { ServiceReviewService } from "./service-review.service.ts";

function baseBooking(overrides: Record<string, any> = {}) {
  return {
    id: "booking-1",
    customer_user_id: "customer-1",
    vendor_id: "vendor-1",
    staff_member_id: "staff-1",
    status: BookingStatus.completed,
    ...overrides,
  };
}

function makeService(
  opts: {
    booking?: Record<string, any> | null;
    existingReview?: Record<string, any> | null;
    saveImpl?: any;
  } = {},
) {
  const booking = opts.booking === undefined ? baseBooking() : opts.booking;
  const existingReview = opts.existingReview === undefined ? null : opts.existingReview;

  const created: Record<string, any>[] = [];
  const saved: Record<string, any>[] = [];

  const bookingRepo = {
    findOne: mock(async () => (booking ? { ...booking } : null)),
  };
  const reviewRepo = {
    findOne: mock(async () => (existingReview ? { ...existingReview } : null)),
    create: mock((input: Record<string, any>) => {
      created.push(input);
      return { id: "review-1", ...input };
    }),
    save: opts.saveImpl
      ? mock(opts.saveImpl)
      : mock(async (row: Record<string, any>) => {
          saved.push(row);
          return row;
        }),
  };
  const recompute = mock(async (_args: { vendorId: string; staffMemberId: string }) => {});
  const ratingRecomputer = { recompute };

  const service = new ServiceReviewService(reviewRepo as any, bookingRepo as any, ratingRecomputer);

  return { service, bookingRepo, reviewRepo, recompute, created, saved };
}

describe("ServiceReviewService.create", () => {
  it("throws 404 when the booking doesn't exist / isn't the caller's", async () => {
    const { service } = makeService({ booking: null });
    try {
      await service.create("customer-1", "booking-1", { rating: 5 });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(404);
    }
  });

  it("throws 403 when the booking is not completed", async () => {
    const { service } = makeService({ booking: baseBooking({ status: BookingStatus.confirmed }) });
    try {
      await service.create("customer-1", "booking-1", { rating: 5 });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(403);
    }
  });

  it("throws 409 when a review already exists (pre-check)", async () => {
    const { service } = makeService({
      existingReview: { id: "review-1", booking_id: "booking-1" },
    });
    try {
      await service.create("customer-1", "booking-1", { rating: 5 });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(409);
    }
  });

  it("translates a unique-violation on save() to 409 (race backstop)", async () => {
    const { service } = makeService({
      saveImpl: async () => {
        throw { code: "23505" };
      },
    });
    try {
      await service.create("customer-1", "booking-1", { rating: 5 });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(409);
    }
  });

  it("rethrows a non-unique-violation save() error unchanged", async () => {
    const boom = new Error("db down");
    const { service } = makeService({
      saveImpl: async () => {
        throw boom;
      },
    });
    await expect(service.create("customer-1", "booking-1", { rating: 5 })).rejects.toBe(boom);
  });

  it("creates the review approved, snapshots vendor/staff off the booking, and recomputes ratings", async () => {
    const { service, created, recompute } = makeService();
    const result = await service.create("customer-1", "booking-1", {
      rating: 4,
      title: "Great service",
      body: "Loved it",
      mediaUrls: ["https://cdn.example/1.jpg"],
    });

    expect(created[0]).toMatchObject({
      booking_id: "booking-1",
      customer_user_id: "customer-1",
      vendor_id: "vendor-1",
      staff_member_id: "staff-1",
      rating: 4,
      title: "Great service",
      body: "Loved it",
      media_urls: ["https://cdn.example/1.jpg"],
      status: ServiceReviewStatus.approved,
    });
    expect(result.status).toBe(ServiceReviewStatus.approved);
    expect(recompute).toHaveBeenCalledTimes(1);
    expect(recompute.mock.calls[0]![0]).toEqual({ vendorId: "vendor-1", staffMemberId: "staff-1" });
  });

  it("defaults title/body to null and media_urls to [] when omitted", async () => {
    const { created } = await (async () => {
      const ctx = makeService();
      await ctx.service.create("customer-1", "booking-1", { rating: 3 });
      return ctx;
    })();
    expect(created[0]).toMatchObject({ title: null, body: null, media_urls: [] });
  });
});

describe("ServiceReviewService.vendorReply", () => {
  function makeReplyService(review: Record<string, any> | null) {
    const reviewRepo = {
      findOne: mock(async () => (review ? { ...review } : null)),
      save: mock(async (row: Record<string, any>) => row),
    };
    const bookingRepo = { findOne: mock(async () => null) };
    const service = new ServiceReviewService(reviewRepo as any, bookingRepo as any, {
      recompute: mock(async () => {}),
    });
    return { service, reviewRepo };
  }

  // The vendorMembership-resolved actor. `role` matters: replying is
  // owner/manager-only (Phase 7 review finding 7) — `products.write` alone,
  // which ordinary staff also hold, is not enough to speak publicly in the
  // vendor's name.
  const OWNER = { vendorId: "vendor-1", role: "owner" };

  it("throws 403 for a non-manager role even though the route's products.write guard passed (finding 7)", async () => {
    const { service, reviewRepo } = makeReplyService({
      id: "review-1",
      vendor_id: "vendor-1",
      vendor_reply: null,
    });
    for (const role of ["staff", "admin", "member", "viewer"]) {
      try {
        await service.vendorReply({ vendorId: "vendor-1", role }, "review-1", "Thanks!");
        throw new Error(`expected throw for role ${role}`);
      } catch (err) {
        expect((err as HttpError).statusCode).toBe(403);
      }
    }
    // Rejected before any write — and before the review is even loaded.
    expect(reviewRepo.save).not.toHaveBeenCalled();
  });

  it("allows both vendor-wide manager roles (owner, manager)", async () => {
    for (const role of ["owner", "manager"]) {
      const { service } = makeReplyService({
        id: "review-1",
        vendor_id: "vendor-1",
        vendor_reply: null,
      });
      const result = await service.vendorReply({ vendorId: "vendor-1", role }, "review-1", "Ty!");
      expect(result.vendor_reply).toBe("Ty!");
    }
  });

  it("throws 404 when the review doesn't belong to the calling vendor", async () => {
    const { service } = makeReplyService(null);
    try {
      await service.vendorReply(OWNER, "review-1", "Thanks!");
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(404);
    }
  });

  it("throws 409 when the vendor has already replied", async () => {
    const { service } = makeReplyService({
      id: "review-1",
      vendor_id: "vendor-1",
      vendor_reply: "Already said thanks",
    });
    try {
      await service.vendorReply(OWNER, "review-1", "Thanks again!");
      throw new Error("expected throw");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(409);
    }
  });

  it("saves the reply on first attempt", async () => {
    const { service, reviewRepo } = makeReplyService({
      id: "review-1",
      vendor_id: "vendor-1",
      vendor_reply: null,
    });
    const result = await service.vendorReply(OWNER, "review-1", "Thanks for visiting!");
    expect(result.vendor_reply).toBe("Thanks for visiting!");
    expect(reviewRepo.save).toHaveBeenCalledTimes(1);
  });
});
