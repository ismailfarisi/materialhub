// reschedule.service.ts
//
// Phase 5 Task 3 (spec §5.3 reschedule). A confirmed booking is moved to a
// NEW slot the customer picked via the existing hold flow (POST /bookings/hold
// -> Redis hold token). The state machine passes through
// `confirmed -> rescheduled -> confirmed` (the `rescheduled` marker is
// recorded in booking_status_history; the booking ENDS confirmed with the new
// times). Money carries over unchanged — no refund/charge on reschedule.
//
// Ordering (why the engagement move happens BEFORE the status transitions):
// the capacity-ledger engagement is the write-side arbiter. We move it (and
// update the bookings row's times/staff) inside ONE transaction FIRST, while
// the booking is still `confirmed`. If the GiST EXCLUDE `no_double_book`
// constraint rejects the new range (`23P01`), that transaction rolls back and
// EngagementService.move surfaces it as a 409 ConflictError — the booking is
// left completely untouched (still confirmed on its OLD slot), never stranded
// mid-way in the `rescheduled` marker state. Only AFTER the move commits do we
// record the two audit transitions and re-time the delayed jobs.
//
// Availability cache: EngagementService.move invalidates BOTH the old and new
// staff/day keys itself; the rescheduled->confirmed transition additionally
// re-confirms the engagement (idempotent) which re-invalidates the new day.
import {
  Booking,
  BookingStatus,
  NotificationType,
  type ServiceArea,
  ServiceLocationMode,
  type ServiceOffering,
  ServiceOfferingStatus,
  StaffEngagement,
} from "@materialhub/database";
import {
  BadRequestError,
  ConflictError,
  HttpError,
  NotFoundError,
  UnprocessableEntityError,
} from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { AvailabilityCache } from "../availability/availability-cache.ts";
import type { AvailabilityService } from "../availability/availability.service.ts";
import { EngagementService } from "../engagement/engagement.service.ts";
import type { BookingHoldService } from "./booking-hold.service.ts";
import { isWithinRescheduleWindow } from "./booking-policy.ts";
import {
  type BookingActor,
  type BookingStatusService,
  InvalidBookingTransitionError,
} from "./booking-status.service.ts";

// Out-of-window customer reschedule (spec §5.3): the customer tried to move a
// booking too close to its start time, past the SNAPSHOTTED
// `reschedule_window_hours`. 422 (well-formed request, business rule blocks
// it) with a greppable code — mirrors PayAtVenueUnavailableError /
// InvalidBookingTransitionError's dedicated-subclass style rather than a bare
// UnprocessableEntityError.
export class RescheduleWindowExpiredError extends HttpError {
  constructor(windowHours: number) {
    super(
      422,
      `Too late to reschedule — this booking can only be rescheduled at least ${windowHours}h before it starts`,
      "reschedule_window_expired",
      { windowHours },
    );
  }
}

export interface RescheduleInput {
  startsAt: Date | string;
  endsAt: Date | string;
  staffMemberId?: string | null;
  locationId?: string | null;
  customerAreaId?: string | null;
  holdToken: string;
  // Edge-stamped "now" for testability (mirrors CreateBookingInput.now).
  now?: Date;
}

// Task 0B (Phase 7) — the vendor-surface reschedule input. Same slot fields as
// the customer RescheduleInput but WITHOUT a `holdToken` (a vendor JWT can't
// mint the customer-gated Redis hold) and WITHOUT location/area overrides (a
// vendor reschedule is a time/staff move only — the booking's existing
// location is reused). Fed to `rescheduleByVendor`, which routes through the
// SAME core as the customer path with the hold verification skipped — see that
// method's comment for why the atomic EXCLUDE re-check keeps this safe.
export interface VendorRescheduleInput {
  startsAt: Date | string;
  endsAt: Date | string;
  staffMemberId?: string | null;
  now?: Date;
}

// The shared core's input: identical to RescheduleInput except `holdToken` is
// optional (absent on the vendor path). The public `reschedule` (customer)
// always supplies it; `rescheduleByVendor` never does.
type RescheduleCoreInput = Omit<RescheduleInput, "holdToken"> & { holdToken?: string };

export interface RescheduleResult {
  booking: Booking;
}

// ─── Narrow DI seams for the three delayed-job schedulers + the notification
// queue, so this file never imports the concrete ReminderScheduler /
// BookingAutoCompleteService / BookingAuthService classes (mirrors the
// interface-seam style already used across booking-status.service.ts). Each
// re-time helper is the one Task 3 is required to call after the slot moves. ──
export interface RescheduleReminderHook {
  rescheduleReminderJobs(booking: Booking, now?: Date): Promise<void>;
}
export interface RescheduleAutoCompleteHook {
  rescheduleAutoCompleteJob(booking: Booking, now?: Date): Promise<void>;
}
export interface RescheduleAuthHook {
  rescheduleBookingAuthJob(booking: Booking, now?: Date): Promise<void>;
}
export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}
// Resolves a vendor's notifiable user id (owner/manager) for the vendor-facing
// reschedule notification. Optional — when unwired the vendor notification is
// simply skipped (best-effort; the customer notification always fires).
export interface VendorOwnerLookup {
  findOwnerUserId(vendorId: string): Promise<string | null>;
}

export class RescheduleService {
  constructor(
    private readonly bookingRepo: Repository<Booking>,
    private readonly offeringRepo: Repository<ServiceOffering>,
    private readonly serviceAreaRepo: Repository<ServiceArea>,
    private readonly availabilityService: AvailabilityService,
    private readonly holdService: BookingHoldService,
    private readonly statusService: BookingStatusService,
    private readonly reminderHook: RescheduleReminderHook,
    private readonly autoCompleteHook: RescheduleAutoCompleteHook,
    private readonly authHook: RescheduleAuthHook,
    private readonly notificationQueue: NotificationEventQueueLike,
    private readonly cache?: AvailabilityCache,
    private readonly vendorOwnerLookup?: VendorOwnerLookup,
  ) {}

  /**
   * Move `bookingId` to a new slot. `actor.role === "customer"` enforces the
   * snapshotted reschedule window; vendor/admin actors bypass it (but NEVER
   * the EXCLUDE re-check — the engagement move is the same for every actor).
   * Ownership scoping matches the read endpoints: a customer can only touch
   * their OWN booking (a booking that exists but isn't theirs is
   * indistinguishable from a missing one — 404).
   *
   * This is the CUSTOMER (and admin) entry point: it ALWAYS verifies the Redis
   * `hold_token` bound to the exact staff+slot being moved to (`skipHold:
   * false`), exactly as strict as before Task 0B. The vendor entry point
   * (`rescheduleByVendor`) is the only caller that skips that verification.
   */
  async reschedule(
    bookingId: string,
    input: RescheduleInput,
    actor: BookingActor,
  ): Promise<RescheduleResult> {
    return this.performReschedule(bookingId, input, actor, { skipHold: false });
  }

  /**
   * Task 0B (Phase 7) — the VENDOR-surface entry point. A vendor/location
   * manager moves one of their own bookings without a customer hold token: a
   * vendor JWT cannot mint the customer-gated Redis hold minted by
   * `POST /bookings/hold`, so this reschedules WITHOUT one (`skipHold: true`).
   * Safe because the atomic GiST EXCLUDE re-check inside the transactional
   * engagement move is the real slot-contention arbiter (a taken slot rolls the
   * whole tx back -> 409) — the hold is only an advisory soft-lock the customer
   * flow layers on top. Everything else (state-machine + manual-source guards,
   * the EXCLUDE move, and ALL Phase 5 delayed-job re-timing + prepay re-auth)
   * runs through the SAME core as the customer path, unchanged. Callers must
   * have already verified the actor owns/manages this booking (the
   * manage-surface controller does vendor + location scoping in front); the
   * non-customer actor here bypasses the customer window per spec.
   */
  async rescheduleByVendor(
    bookingId: string,
    input: VendorRescheduleInput,
    actor: BookingActor,
    vendorId?: string,
  ): Promise<RescheduleResult> {
    return this.performReschedule(bookingId, { ...input }, actor, {
      skipHold: true,
      expectedVendorId: vendorId,
    });
  }

  private async performReschedule(
    bookingId: string,
    input: RescheduleCoreInput,
    actor: BookingActor,
    opts: { skipHold: boolean; expectedVendorId?: string },
  ): Promise<RescheduleResult> {
    const now = input.now ?? new Date();

    // Guard the ownership predicate: a customer actor with a falsy id would make
    // `customer_user_id: undefined` DROP that filter, silently widening the
    // lookup to ANY booking by id (a customer rescheduling someone else's
    // booking). A customer must always carry an id — fail loud instead.
    if (actor.role === "customer" && !actor.id) {
      throw new BadRequestError("A customer actor must have an id");
    }

    // Ownership-scoped load (customer sees only own; admin/vendor by id).
    const booking =
      actor.role === "customer"
        ? await this.bookingRepo.findOne({
            where: { id: bookingId, customer_user_id: actor.id ?? undefined },
          })
        : await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");

    // M2 (Task 0B review): when a vendor id is threaded in (vendor manage
    // path), the re-loaded booking MUST belong to that vendor. The manage
    // controller already scopes ownership in front, so this is defense-in-depth
    // that makes the SERVICE self-guarding for future callers: a vendor actor
    // passing an arbitrary bookingId for another vendor's booking gets a 404
    // (hide existence, mirroring the controller's own ownership check) rather
    // than a cross-vendor reschedule. The customer path (own-booking scoped
    // load above) and the admin path (no expectedVendorId) are unaffected.
    if (opts.expectedVendorId && booking.vendor_id !== opts.expectedVendorId) {
      throw new NotFoundError("Booking not found");
    }

    // Phase 6 (review I1): a manual walk-in/phone booking (customer_user_id
    // NULL <=> source !== 'marketplace', see booking.entity.ts) must NEVER be
    // rescheduled through this flow. It has no MaterialHub customer and no
    // commission accrual (ManualBookingService's binding capacity-only
    // decision), but reschedule() unconditionally re-arms the auto-complete
    // job at the end — which for a service-bearing walk-in would eventually
    // complete it with commissionFils:0 and post a zero-commission accrual row
    // that pays the vendor the walk-in's full net price for money MaterialHub
    // never touched. A manager retiming a walk-in should just cancel + recreate
    // it (same rationale the service-offering guard below already states). 422
    // (well-formed request, business rule blocks it) — the actor CAN see this
    // booking (it's their vendor's), so a 404 would be misleadingly opaque;
    // matches the reschedule window/transition 422 posture. Guard fires BEFORE
    // the confirmed-status check so a confirmed walk-in gets this precise reason
    // rather than a transition error. Mirrors reminder-scheduler.ts:136 /
    // booking-auth's own null-customer discrimination.
    if (!booking.customer_user_id) {
      throw new UnprocessableEntityError(
        "Walk-in and phone bookings cannot be rescheduled — cancel and recreate instead",
      );
    }

    // Only a confirmed booking can be rescheduled (spec §5.3 — the only source
    // of the confirmed->rescheduled edge). Anything else (pending_payment,
    // completed, cancelled, ...) is an illegal transition. Reuse the state
    // machine's own error type so callers see the same 422
    // invalid_booking_transition they'd get from BookingStatusService — and
    // fail here BEFORE resolving availability / touching the hold.
    if (booking.status !== BookingStatus.confirmed) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.rescheduled);
    }

    // Customer window enforcement (vendor/admin bypass). Uses the booking's
    // SNAPSHOTTED reschedule_window_hours (spec §5.3 — a later vendor policy
    // edit can't change an existing customer's deal).
    if (actor.role === "customer") {
      const withinWindow = isWithinRescheduleWindow(
        now,
        new Date(booking.starts_at),
        booking.reschedule_window_hours,
      );
      if (!withinWindow) throw new RescheduleWindowExpiredError(booking.reschedule_window_hours);
    }

    // Phase 6: service_offering_id is nullable (a manual walk-in/phone booking
    // created from customer details alone, no service picked — 1782390000000).
    // Reschedule needs a real offering to re-validate the slot window/location
    // mode against, so a service-less booking can't be rescheduled through
    // this flow (there's no marketplace availability to re-check against
    // anyway; a manager retiming a walk-in should just cancel + recreate it).
    if (!booking.service_offering_id) {
      throw new BadRequestError("This booking has no service offering and cannot be rescheduled");
    }
    const offering = await this.loadPublishedOffering(booking.service_offering_id);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    this.validateSlotWindow(offering, startsAt, endsAt);

    const wantsHomeVisit = this.resolveWantsHomeVisit(offering, input.customerAreaId);
    // Reuse the booking's existing location for at-premises unless overridden.
    const locationId = wantsHomeVisit ? null : (input.locationId ?? booking.location_id);
    if (!wantsHomeVisit && !locationId) {
      throw new BadRequestError("locationId is required for at-premises bookings");
    }
    if (wantsHomeVisit && !input.customerAreaId) {
      // Home-visit reschedule needs the service area to resolve staff/timezone
      // (the booking row stores customer_address, not area_id). Same 422 as
      // create()/hold() rather than a misleading availability 409.
      throw new UnprocessableEntityError("customerAreaId is required for home-visit bookings");
    }

    // Resolve an eligible + free staff member for the NEW slot via the Phase 3
    // availability engine (never re-derives slot math). The booking's own
    // current engagement occupies the OLD slot, so a NON-overlapping new slot
    // resolves cleanly; a new slot already taken by another engagement returns
    // zero staff_options -> 409 here (the EXCLUDE below is the backstop).
    const staffMemberId = await this.resolveStaffForSlot(offering, {
      wantsHomeVisit,
      locationId,
      customerAreaId: input.customerAreaId,
      staffMemberId: input.staffMemberId,
      startsAt,
      endsAt,
      now,
    });

    // Bind the hold to the EXACT staff+slot being moved to (same guarantee as
    // create() — a token minted for staff X / slot A can't move a booking to
    // staff Y / slot B). 409 on mismatch/expiry. CUSTOMER path only: the vendor
    // path (`skipHold`) has no hold token to verify — the EXCLUDE re-check
    // below is the slot-contention arbiter for it. The customer branch runs the
    // exact same verification it always did.
    if (!opts.skipHold) {
      await this.holdService.assertHeldFor(input.holdToken as string, staffMemberId, {
        start: startsAt,
        end: endsAt,
      });
    }

    // Engagement range includes buffers (travel buffer only for home-visit),
    // mirroring create()'s computation exactly.
    let travelBufferMinutes = 0;
    if (wantsHomeVisit) {
      const area = await this.serviceAreaRepo.findOne({
        where: { vendor_id: offering.vendor_id, area_id: input.customerAreaId as string },
      });
      travelBufferMinutes = area?.travel_buffer_minutes ?? 0;
    }
    const bufferBeforeMs = (offering.buffer_before_minutes + travelBufferMinutes) * 60_000;
    const bufferAfterMs = (offering.buffer_after_minutes + travelBufferMinutes) * 60_000;
    const engagementStartsAt = new Date(startsAt.getTime() - bufferBeforeMs);
    const engagementEndsAt = new Date(endsAt.getTime() + bufferAfterMs);

    // ── Atomic capacity move (EXCLUDE re-check -> 409) + booking-time update.
    // Booking status stays `confirmed` here; a 23P01 rolls the WHOLE tx back,
    // leaving the booking on its old slot. ──
    try {
      await this.bookingRepo.manager.transaction(async (manager) => {
        const engagementRepo = manager.getRepository(StaffEngagement);
        const bookingRepoTx = manager.getRepository(Booking);
        const engagementService = new EngagementService(engagementRepo, this.cache);

        await engagementService.move({
          engagementId: booking.engagement_id,
          staffMemberId,
          startsAt: engagementStartsAt,
          endsAt: engagementEndsAt,
        });

        await bookingRepoTx.update(
          { id: booking.id },
          {
            starts_at: startsAt,
            ends_at: endsAt,
            staff_member_id: staffMemberId,
            ...(wantsHomeVisit ? {} : { location_id: locationId }),
          },
        );
      });
    } catch (err) {
      // Hold is a short-TTL Redis key; free it on ANY failure so a retry isn't
      // blocked by the customer's own stale hold. release() is a
      // compare-and-delete by token (safe if already gone). Re-throw unchanged
      // (the ConflictError 409 from the EXCLUDE, or any other error). No-op on
      // the vendor path (no hold token to release).
      if (input.holdToken) {
        await this.holdService.release(input.holdToken).catch(() => undefined);
      }
      throw err;
    }

    // Audit transitions (spec §5.3): confirmed -> rescheduled -> confirmed.
    //
    // PHASE 7 REVIEW FIX #1: this used to be TWO independent
    // `statusService.transition()` calls — two separate committed transactions
    // with no outer transaction and no compensation. A crash / pod-roll
    // between them left the booking durably `rescheduled`, which NO api and NO
    // job can act on (`rescheduled`'s only outgoing edge was produced by the
    // second call itself; cancel/no-show/reschedule all require `confirmed`;
    // confirm() no-ops off `pending_payment`; the reaper only scans
    // `pending_payment`) — slot blocked forever, Stripe auth left open, and
    // the delayed jobs already torn down by the first transition while the
    // re-arm below never ran.
    //
    // `transitionThroughRescheduled` commits BOTH status flips and BOTH
    // history rows in ONE transaction, so `rescheduled` is never a committed
    // state: any failure rolls back to `confirmed` on the (already-moved) new
    // slot — a state every existing flow can act on — instead of stranding the
    // booking. The post-commit delayed-job cleanup and this method's re-arm
    // contract below are unchanged.
    const reason = `Rescheduled by ${actor.role} to ${startsAt.toISOString()}`;
    const updated = await this.statusService.transitionThroughRescheduled(
      booking.id,
      actor,
      reason,
    );

    // Re-time ALL THREE delayed jobs for the NEW slot (hard requirement). Done
    // AFTER both transitions (the cleanup removes fired during the
    // rescheduled transition are near-instant Redis DELs that complete well
    // before these adds, which sit behind two awaited DB transactions). Each
    // reschedule* helper removes-then-adds, so a stale same-id job can't
    // silently swallow the re-add.
    await this.reminderHook.rescheduleReminderJobs(updated, now);
    await this.autoCompleteHook.rescheduleAutoCompleteJob(updated, now);
    await this.authHook.rescheduleBookingAuthJob(updated, now);

    // Hold has done its job — release it (best-effort). No-op on the vendor
    // path (no hold token was ever minted).
    if (input.holdToken) {
      await this.holdService.release(input.holdToken).catch(() => undefined);
    }

    // Notifications (event emission only — Task 8 owns templates). Customer
    // booking_rescheduled always; vendor best-effort if an owner user resolves.
    await this.emitNotifications(updated, offering);

    return { booking: updated };
  }

  private async emitNotifications(booking: Booking, offering: ServiceOffering): Promise<void> {
    const variables = {
      service_name: booking.service_name,
      booking_number: booking.booking_number,
      starts_at: new Date(booking.starts_at).toISOString(),
      ends_at: new Date(booking.ends_at).toISOString(),
    };
    const data = {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      vendorId: booking.vendor_id,
      startsAt: new Date(booking.starts_at).toISOString(),
      endsAt: new Date(booking.ends_at).toISOString(),
      serviceName: booking.service_name,
    };

    try {
      await this.notificationQueue.add("notification-event", {
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_rescheduled,
        variables,
        data,
      });
    } catch (err) {
      console.warn(
        `[reschedule] failed to emit customer booking_rescheduled for ${booking.id}`,
        err,
      );
    }

    if (!this.vendorOwnerLookup) return;
    try {
      const vendorUserId = await this.vendorOwnerLookup.findOwnerUserId(offering.vendor_id);
      if (!vendorUserId) return;
      await this.notificationQueue.add("notification-event", {
        userId: vendorUserId,
        notificationType: NotificationType.booking_rescheduled,
        variables,
        data: { ...data, customerUserId: booking.customer_user_id },
      });
    } catch (err) {
      console.warn(`[reschedule] failed to emit vendor booking_rescheduled for ${booking.id}`, err);
    }
  }

  // ── Shared resolution helpers (kept in sync with BookingService's private
  // equivalents — deliberately small duplications rather than widening
  // BookingService's public surface for one caller; see that file). ──

  private async loadPublishedOffering(offeringId: string): Promise<ServiceOffering> {
    const offering = await this.offeringRepo.findOne({ where: { id: offeringId } });
    if (!offering) throw new NotFoundError("Service offering not found");
    if (offering.status !== ServiceOfferingStatus.published) {
      throw new UnprocessableEntityError("Service offering is not available for booking");
    }
    return offering;
  }

  private validateSlotWindow(offering: ServiceOffering, startsAt: Date, endsAt: Date): void {
    if (!(startsAt.getTime() < endsAt.getTime())) {
      throw new BadRequestError("startsAt must be before endsAt");
    }
    if (endsAt.getTime() - startsAt.getTime() !== offering.duration_minutes * 60_000) {
      throw new BadRequestError("endsAt does not match the offering's duration");
    }
  }

  private resolveWantsHomeVisit(
    offering: ServiceOffering,
    customerAreaId: string | null | undefined,
  ): boolean {
    if (offering.location_mode === ServiceLocationMode.home_visit) return true;
    if (offering.location_mode === ServiceLocationMode.at_premises) return false;
    return !!customerAreaId; // either
  }

  private async resolveStaffForSlot(
    offering: ServiceOffering,
    params: {
      wantsHomeVisit: boolean;
      locationId?: string | null;
      customerAreaId?: string | null;
      staffMemberId?: string | null;
      startsAt: Date;
      endsAt: Date;
      now: Date;
    },
  ): Promise<string> {
    const availability = await this.availabilityService.getAvailability({
      offeringId: offering.id,
      locationId: params.wantsHomeVisit ? undefined : (params.locationId ?? undefined),
      customerAreaId: params.wantsHomeVisit ? (params.customerAreaId ?? undefined) : undefined,
      staffId: params.staffMemberId ?? undefined,
      from: params.startsAt,
      to: params.endsAt,
      now: params.now,
    });
    const startIso = params.startsAt.toISOString();
    const endIso = params.endsAt.toISOString();
    const matchedSlot = availability.slots.find((s) => s.start === startIso && s.end === endIso);
    if (!matchedSlot || matchedSlot.staff_options.length === 0) {
      throw new ConflictError("Requested slot is no longer available");
    }
    const staffMemberId = params.staffMemberId ?? matchedSlot.staff_options[0];
    if (!staffMemberId || !matchedSlot.staff_options.includes(staffMemberId)) {
      throw new ConflictError("Requested slot is no longer available");
    }
    return staffMemberId;
  }
}
