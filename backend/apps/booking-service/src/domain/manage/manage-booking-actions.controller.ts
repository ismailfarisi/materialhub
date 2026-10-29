// manage-booking-actions.controller.ts
//
// Task 0B (Phase 7) — the vendor/location-manager surface for the three
// booking MUTATIONS the recon flagged as missing: complete, no-show, and
// reschedule. Mirrors block-time.controller.ts's split: this controller owns
// only the AUTHORIZATION in front (vendor ownership + location scope) and then
// DELEGATES to the exact same money-moving services the admin routes /
// auto-complete job already use — it adds zero new money logic.
//
// ── Shared authorization (spec §8 vendor surface) ────────────────────────────
// The outer route gates on `vendorMembership("products.write")` (the only
// booking permission string). On TOP of that, per booking:
//   - the booking must exist AND belong to the active vendor
//     (`vendor_id === actor.vendorId`); anything else is a 404 (hide existence,
//     mirroring DELETE /manage/blocks/:id — never leak that a booking exists
//     for another vendor).
//   - location scope: a booking tied to a branch (`location_id` non-null) runs
//     `assertLocationManager` (owner/manager pass vendor-wide; any other role
//     needs an active managing location_membership for THAT branch). A
//     home-visit booking (`location_id` null) has no branch to scope to, so —
//     mirroring the review-reply reasoning — it's owner/manager only.
// The actor handed to the underlying service is a NON-customer ("vendor")
// actor: the customer self-serve windows (reschedule window) do not gate the
// vendor, but the services' own state-machine + no-show-window + manual-source
// rules still stand (they're actor-independent).
import type { Booking } from "@materialhub/database";
import type { NoShowBookingBody } from "@materialhub/dto";
import { ForbiddenError, HttpError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import {
  type LocationScopeRepos,
  assertLocationManager,
  isVendorManagerRole,
} from "../../guards/location-scope.ts";
import type { BookingActor } from "../booking/booking-status.service.ts";
import type { NoShowService } from "../booking/no-show.service.ts";
import type { RescheduleService } from "../booking/reschedule.service.ts";

// The completion path this controller reuses (BookingStatusService.completeBooking
// — the SAME method the auto-complete job and admin path drive). Narrow seam so
// this file doesn't import the concrete class (mirrors the interface-seam style
// used across the booking domain).
export interface BookingCompletionTransitioner {
  completeBooking(bookingId: string, actor: BookingActor, reason?: string): Promise<Booking>;
}

// I1 (Task 0B review): a dedicated 422 for the vendor-complete lower-bound
// window rule (completing before starts_at), distinct from the state-machine's
// invalid_booking_transition so the wire code is a greppable `complete_window`.
// Mirrors NoShowService.NoShowWindowError's shape exactly. Deliberately
// route-scoped (defined here, thrown only by the vendor manage-complete path):
// the platform-admin route and the system auto-complete job are NOT
// self-interested and keep completing at any time.
export class CompleteWindowError extends HttpError {
  constructor(message: string) {
    super(422, message, "complete_window");
  }
}

export interface ManageBookingActor {
  userId: string;
  vendorId: string;
  role: string;
}

export interface ManageRescheduleRequest {
  starts_at: string;
  ends_at: string;
  staff_member_id?: string | null;
}

export class ManageBookingActionsController {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly locationScope: LocationScopeRepos,
    private readonly completionService: BookingCompletionTransitioner,
    private readonly noShowService: NoShowService,
    private readonly rescheduleService: RescheduleService,
  ) {}

  // Load + authorize a single booking for a vendor-surface mutation. 404 on
  // wrong-vendor/nonexistent (hide existence); location-scope enforced per the
  // header comment. Returns the loaded booking so callers needn't re-query.
  private async authorize(actor: ManageBookingActor, bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking || booking.vendor_id !== actor.vendorId) {
      throw new NotFoundError("Booking not found");
    }

    const scopeActor = { userId: actor.userId, vendorId: actor.vendorId, role: actor.role };
    if (booking.location_id) {
      await assertLocationManager(scopeActor, booking.location_id, this.locationScope);
    } else if (!isVendorManagerRole(actor.role)) {
      // Home-visit booking (no branch to scope to) — owner/manager only, same
      // reasoning as the vendor review-reply route.
      throw new ForbiddenError("Only an owner or manager can manage home-visit bookings");
    }

    return booking;
  }

  // The non-customer actor threaded to the underlying services. `id` is the
  // acting user; `role: "vendor"` bypasses the customer-only windows while
  // leaving every state-machine / window / source rule in the services intact.
  private serviceActor(actor: ManageBookingActor): BookingActor {
    return { id: actor.userId, role: "vendor" };
  }

  // POST /manage/bookings/:id/complete — reuses BookingStatusService.completeBooking
  // (capture + commission accrual; the capacity-only handling for manual
  // walk-in/phone bookings lives on that shared path — see
  // BookingCompletionService.onCompleted — not re-implemented here).
  async complete(actor: ManageBookingActor, bookingId: string, now: Date = new Date()) {
    const booking = await this.authorize(actor, bookingId);

    // I1 (Task 0B review): a VENDOR cannot complete a booking before it has
    // started — that would pull revenue forward (early prepay capture +
    // commission accrual) and strip the customer of the in-window
    // cancel-for-refund they were promised. Lower bound only, mirroring
    // NoShowService's `now < starts_at` window check. This guard lives on the
    // VENDOR manage route ALONE: the platform-admin route and the system
    // auto-complete job are not self-interested and keep completing any time.
    if (now.getTime() < new Date(booking.starts_at).getTime()) {
      throw new CompleteWindowError("Cannot complete a booking before its start time");
    }

    const completed = await this.completionService.completeBooking(
      bookingId,
      this.serviceActor(actor),
      `Completed by ${actor.role} via the vendor manage surface`,
    );
    return { booking: completed };
  }

  // POST /manage/bookings/:id/no-show — reuses NoShowService (window rule +
  // forfeit/penalty/strike untouched). Response mirrors the admin no-show route.
  async noShow(actor: ManageBookingActor, bookingId: string, body: NoShowBookingBody) {
    await this.authorize(actor, bookingId);
    const result = await this.noShowService.markNoShow(bookingId, this.serviceActor(actor), {
      reason: body.reason ?? null,
    });
    return {
      booking: result.booking,
      forfeit_fils: result.forfeitFils,
      refund_fils: result.refundFils,
      action: result.action,
      policy: result.policy,
    };
  }

  // POST /manage/bookings/:id/reschedule — reuses RescheduleService via its
  // vendor entry point (window bypass, hold skipped, EXCLUDE re-check +
  // delayed-job re-timing + prepay re-auth unchanged).
  async reschedule(actor: ManageBookingActor, bookingId: string, body: ManageRescheduleRequest) {
    await this.authorize(actor, bookingId);
    const result = await this.rescheduleService.rescheduleByVendor(
      bookingId,
      {
        startsAt: body.starts_at,
        endsAt: body.ends_at,
        staffMemberId: body.staff_member_id ?? undefined,
      },
      this.serviceActor(actor),
      // M2: thread the active vendor id so the service re-load is vendor-scoped
      // (self-guarding defense-in-depth on top of authorize()'s ownership check).
      actor.vendorId,
    );
    return { booking: result.booking };
  }
}
