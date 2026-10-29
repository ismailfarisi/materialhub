// service-review.service.ts
//
// Phase 5 Task 7 (spec §4.3/§7 "Booking-gated reviews"). A customer reviews a
// booking after it completes; a vendor may reply once. Separate file mirroring
// cancel.service.ts/no-show.service.ts — one responsibility per file.
//
// ── Gate (brief) ──────────────────────────────────────────────────────────
// Allowed only if: the booking belongs to the customer (ownership -> 404,
// matching every other customer booking endpoint's not-mine-or-doesn't-exist
// convention — see booking.routes.ts's GET /bookings/:id comment) AND
// booking.status === completed (not-yet-completed -> 403 — the brief names
// 403 explicitly; this is a DELIBERATE departure from the booking
// state-machine's usual 422 InvalidBookingTransitionError, because a review
// isn't a booking-status transition at all) AND no existing review for the
// booking (409, uq_service_reviews_booking backstops the race — see
// isUniqueViolation below).
//
// ── Moderation status: `approved`, not the product-review-precedent `pending`
// (DESIGN DEVIATION — flagged in the Task 7 report) ─────────────────────────
// order-service's ReviewService.createReview (apps/order-service/src/domain/
// reviews/review.service.ts) creates product reviews as `pending` and only
// enqueues the rating recompute from `approveReview` (an admin moderation
// action). booking-service has NO admin approve/reject/list surface for
// service_reviews anywhere (not built by any prior task, not in this task's
// brief) — mirroring `pending` verbatim would mean a booking review NEVER
// visibly affects staff_member.rating / vendor.rating_avg, which contradicts
// the brief's own live-DB test ("after completion -> created + ratings
// updated"). Booking reviews are also more inherently trustworthy than the
// open product-review path: they're gated on a REAL completed booking the
// caller owns (is_verified defaults true off booking_id by construction,
// same reasoning as product's is_verified_purchase), one per booking. Given
// that, new reviews are created directly `approved`. The `pending`/`rejected`/
// `flagged` states are kept on the enum for a future admin-moderation phase
// (flagging abuse etc.) — same "documented gap, Phase 7" posture Task 5 used
// for the no-show vendor-route surface — they're just not reachable from this
// task's endpoints.
//
// ── Rating recompute reachability (Phase 7 review, finding 8) ──────────────
// `ratingRecomputer.recompute` is currently only reachable from create().
// There is NO delete / soft-delete / moderation endpoint for service_reviews
// anywhere on this branch (grep: nothing outside this module writes the
// table), so nothing can silently drift today. But the aggregates are
// recompute-from-scratch over `status = approved AND deleted_at IS NULL`, so
// the FIRST endpoint that soft-deletes a review or moves it off `approved`
// MUST call recompute({ vendorId, staffMemberId }) after the write, exactly
// as create() does below — otherwise staff_member.rating / vendor.rating_avg
// keep counting a review that is no longer visible.
import {
  type Booking,
  BookingStatus,
  type ServiceReview,
  ServiceReviewStatus,
} from "@materialhub/database";
import { ConflictError, ForbiddenError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { isVendorManagerRole } from "../../guards/location-scope.ts";

export interface CreateServiceReviewInput {
  rating: number;
  title?: string | null;
  body?: string | null;
  mediaUrls?: string[];
}

// Narrow DI seam (mirrors CancelPaymentClient/NoShowPaymentClient) — this file
// never imports the concrete ServiceReviewRatingService.
export interface ServiceReviewRatingRecomputer {
  recompute(input: { vendorId: string; staffMemberId: string }): Promise<void>;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export class ServiceReviewService {
  constructor(
    private readonly reviewRepo: Repository<ServiceReview>,
    private readonly bookingRepo: Repository<Booking>,
    private readonly ratingRecomputer: ServiceReviewRatingRecomputer,
  ) {}

  async create(
    customerId: string,
    bookingId: string,
    input: CreateServiceReviewInput,
  ): Promise<ServiceReview> {
    // Ownership-scoped load — a booking that exists but isn't the caller's
    // reads as 404 (mirrors CancelService.cancel's customer branch).
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId, customer_user_id: customerId },
    });
    if (!booking) throw new NotFoundError("Booking not found");

    if (booking.status !== BookingStatus.completed) {
      throw new ForbiddenError("Booking must be completed before it can be reviewed");
    }

    // Pre-check (fast path) — the unique index (uq_service_reviews_booking) is
    // the actual race backstop below, since a plain findOne-then-insert has a
    // TOCTOU gap under concurrent requests.
    const existing = await this.reviewRepo.findOne({ where: { booking_id: bookingId } });
    if (existing) throw new ConflictError("A review already exists for this booking");

    const review = this.reviewRepo.create({
      booking_id: bookingId,
      customer_user_id: customerId,
      vendor_id: booking.vendor_id,
      staff_member_id: booking.staff_member_id,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body ?? null,
      media_urls: input.mediaUrls ?? [],
      status: ServiceReviewStatus.approved,
    });

    let saved: ServiceReview;
    try {
      saved = await this.reviewRepo.save(review);
    } catch (err) {
      // Race backstop: a concurrent request won the insert between our
      // pre-check and this save — translate the partial-unique-index
      // violation (uq_service_reviews_booking) to the same 409 as the
      // pre-check. TypeORM's repo.upsert()/bare ON CONFLICT does NOT target
      // partial unique indexes (WHERE deleted_at IS NULL), so this is a plain
      // insert + catch, not an upsert.
      if (isUniqueViolation(err)) {
        throw new ConflictError("A review already exists for this booking");
      }
      throw err;
    }

    // Recompute AFTER the row is durably saved (recompute-from-aggregate, not
    // incremental math — see service-review-rating.service.ts). Not
    // best-effort-swallowed like the notification emissions elsewhere in
    // Phase 5: a failed recompute here should surface (the review write itself
    // already succeeded and won't be retried by the caller, so a silent
    // ratings drift would go unnoticed — unlike a missed notification, which
    // has no comparably invisible failure mode).
    await this.ratingRecomputer.recompute({
      vendorId: booking.vendor_id,
      staffMemberId: booking.staff_member_id,
    });

    return saved;
  }

  /**
   * Vendor reply. Vendor-scoped: the route gates via
   * vendorMembership("products.write") — the SAME guard staff.routes.ts /
   * location.routes.ts already use for vendor-level booking-service
   * management (see service-review.routes.ts) — rather than a location-scoped
   * guard (assertLocationManager), because a booking's `location_id` is
   * nullable (home-visit bookings have none), so scoping a reply to a specific
   * branch doesn't generalize. `actor.vendorId` is the caller's active vendor
   * (member.vid); a review belonging to a different vendor reads as 404
   * (mirrors StaffService.assertOwnStaff). One reply per review (mirrors
   * order-service ReviewService.vendorReply) — a second attempt 409s.
   *
   * Phase 7 review (finding 7): the permission gate alone is NOT the whole
   * authorization. `products.write` is held by ordinary staff too, and a
   * reply is a PUBLIC statement made in the vendor's name — so this also
   * requires a vendor-wide manager role, exactly as
   * ManageBookingActionsController.loadScopedBooking does for the
   * un-branch-scopable home-visit case (which cites "same reasoning as the
   * vendor review-reply route" — that reasoning is now actually enforced on
   * both sides). Same `isVendorManagerRole` helper, same ForbiddenError.
   */
  async vendorReply(
    actor: { vendorId: string; role: string },
    reviewId: string,
    reply: string,
  ): Promise<ServiceReview> {
    if (!isVendorManagerRole(actor.role)) {
      throw new ForbiddenError("Only an owner or manager can reply to a review");
    }
    const vendorId = actor.vendorId;
    const review = await this.reviewRepo.findOne({ where: { id: reviewId, vendor_id: vendorId } });
    if (!review) throw new NotFoundError("Review not found");
    if (review.vendor_reply != null) {
      throw new ConflictError("Vendor has already replied to this review");
    }
    review.vendor_reply = reply;
    return this.reviewRepo.save(review);
  }
}
