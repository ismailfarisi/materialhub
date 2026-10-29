import {
  Booking,
  BookingStatus,
  type Category,
  DepositType,
  EngagementKind,
  EngagementStatus,
  type ServiceArea,
  ServiceLocationMode,
  type ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
  type SiteSetting,
  StaffEngagement,
  type User,
  type Vendor,
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
import { type BookingHoldService, HOLD_TTL_SECONDS } from "./booking-hold.service.ts";
import type { BookingPaymentClient } from "./booking-payment.client.ts";
import { BookingStatusService } from "./booking-status.service.ts";
import { CommissionSnapshotService } from "./commission-snapshot.service.ts";
import type { StrikeService } from "./strike.service.ts";

// Gate on a per-vendor no-show strike threshold before allowing pay_at_venue
// (spec §5.3: "enough strikes at a vendor revoke pay_at_venue eligibility at
// that vendor" + a higher platform-wide backstop). The real check — counting
// `bookings WHERE status='no_show' AND customer_user_id=... AND
// vendor_id=...` — lands in Phase 5; this is the wired seam Task 5 promises:
// always "allowed" until Phase 5 replaces it. Kept as a dedicated,
// overridable class method (rather than a free function) so a future
// subclass/DI swap can drop in the real implementation without touching the
// rest of BookingService.
export class PayAtVenueUnavailableError extends HttpError {
  constructor(message = "pay_at_venue is not available for this vendor — a deposit is required") {
    super(422, message, "pay_at_venue_unavailable");
  }
}

export interface CreateBookingInput {
  offeringId: string;
  // Explicit slot the customer picked (matches an AvailabilityResult.slots[]
  // entry exactly — the service window, buffers excluded). Required so the
  // service can validate start < end and cross-check the exact slot is still
  // free via the availability engine, rather than trusting a bare startsAt +
  // recomputing duration itself.
  startsAt: Date | string;
  endsAt: Date | string;
  // Preferred staff, if the customer picked one from staff_options; omitted
  // lets the service auto-assign the first eligible+free staff member.
  staffMemberId?: string | null;
  // Required for at_premises bookings (location_mode = at_premises/either).
  locationId?: string | null;
  // Presence signals "home visit requested"; required for home_visit bookings.
  customerAreaId?: string | null;
  customerAddress?: Record<string, unknown> | null;
  // Token from POST /bookings/hold (Task 8) — verified (via assertHeldFor)
  // to be bound to the exact staffMemberId/startsAt/endsAt being booked, not
  // merely "some live hold", then released once the booking durably exists
  // (or on any failure).
  holdToken: string;
  notes?: string | null;
  // Edge-stamped "now" for testability / consistency with the availability
  // engine's own now-injection; defaults to `new Date()`.
  now?: Date;
}

export interface CreateBookingResult {
  booking: Booking;
  engagement: StaffEngagement;
  // Populated for deposit (capture-now PaymentIntent) and prepay (SetupIntent)
  // — null for pay_at_venue, which is already confirmed with nothing to pay
  // client-side right now.
  clientSecret: string | null;
  paymentIntentId?: string | null;
  setupIntentId?: string | null;
}

// POST /bookings/hold input (Task 8) — a subset of CreateBookingInput minus
// customer_address/notes/holdToken, which only make sense once actually
// creating the booking.
export interface HoldBookingInput {
  offeringId: string;
  startsAt: Date | string;
  endsAt: Date | string;
  staffMemberId?: string | null;
  locationId?: string | null;
  customerAreaId?: string | null;
  now?: Date;
}

export interface HoldBookingResult {
  holdToken: string;
  expiresInSeconds: number;
  staffMemberId: string;
  // Always [offering.payment_mode] until the real per-vendor strike gate
  // (Phase 5) lands, EXCEPT when the offering's only mode is pay_at_venue and
  // checkPayAtVenueAllowed blocks the customer — then empty, so checkout has
  // nothing valid to render and can show explanatory copy. create()'s
  // `422 pay_at_venue_unavailable` remains the backstop either way.
  allowedPaymentModes: ServicePaymentMode[];
}

function generateBookingNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BK${ts}${rand}`.slice(0, 30);
}

/**
 * The central booking transaction (Phase 4 Task 5, spec §5.1 steps 2-4 minus
 * the webhook-driven confirm, §5.2 payment-mode branching, §5.3 state
 * machine's pending_payment entry + pay_at_venue's immediate confirm).
 *
 * Flow: resolve offering + an eligible/free staff member for the exact slot
 * (via AvailabilityService — never reimplements slot math) → one DB
 * transaction reserves the capacity-ledger engagement (held) and inserts the
 * booking (pending_payment) with a full price/vat/deposit/policy/commission
 * snapshot → branch on payment_mode. EXCLUDE `23P01` surfaces as
 * `ConflictError` from `EngagementService.reserve` itself (it already maps
 * the pg error by `.code`, not message text); this service releases the
 * Redis hold on ANY failure from that transaction (not just the EXCLUDE
 * conflict) and re-throws the original error unchanged. Before the
 * transaction, the hold token is verified via `assertHeldFor` to be bound to
 * the exact staff+slot resolved below, not merely "some live hold".
 */
export class BookingService {
  private readonly commissionSnapshot: CommissionSnapshotService;
  // Task 6's state machine — confirmPayAtVenue below goes through
  // `statusService.confirmPayAtVenue` rather than writing its own inline
  // status-update + history-row logic (see that method's comment). Phase 5
  // final review Fix 1: this is the CONTAINER'S fully-wired instance (with the
  // auto-complete/reminder/notification hooks) when injected, so a pay_at_venue
  // confirm fires the exact same post-confirm hooks a deposit/prepay confirm
  // does; falls back to a bare instance only for isolated unit tests.
  private readonly statusService: BookingStatusService;

  constructor(
    private readonly offeringRepo: Repository<ServiceOffering>,
    private readonly bookingRepo: Repository<Booking>,
    private readonly serviceAreaRepo: Repository<ServiceArea>,
    private readonly userRepo: Repository<User>,
    private readonly vendorRepo: Repository<Vendor>,
    private readonly categoryRepo: Repository<Category>,
    private readonly siteSettingRepo: Repository<SiteSetting>,
    private readonly availabilityService: AvailabilityService,
    private readonly holdService: BookingHoldService,
    private readonly paymentClient: BookingPaymentClient,
    private readonly cache?: AvailabilityCache,
    // Phase 5 Task 5: the real per-vendor/platform no-show strike gate. Optional
    // so this class stays constructible in isolation (unit tests / any
    // pay_at_venue-free path) — when unwired, checkPayAtVenueAllowed falls back
    // to "allowed", exactly the Phase 4 seam behaviour.
    private readonly strikeService?: StrikeService,
    // Phase 5 final review Fix 1: the container's fully-wired
    // BookingStatusService (auto-complete + reminder + notification hooks).
    // Optional + trailing so isolated unit tests (and any construction that
    // never books pay_at_venue) still compile; when unwired it falls back to a
    // bare instance whose post-confirm hooks simply no-op — the same behaviour
    // the old inline `transition()` path had, but now via the shared
    // confirmPayAtVenue/postConfirm surface so the wired path can't drift.
    statusService?: BookingStatusService,
  ) {
    this.commissionSnapshot = new CommissionSnapshotService(
      this.vendorRepo,
      this.categoryRepo,
      this.siteSettingRepo,
    );
    this.statusService = statusService ?? new BookingStatusService(this.bookingRepo, this.cache);
  }

  async create(customerId: string, input: CreateBookingInput): Promise<CreateBookingResult> {
    const now = input.now ?? new Date();

    const offering = await this.loadPublishedOffering(input.offeringId);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    this.validateSlotWindow(offering, startsAt, endsAt);

    const wantsHomeVisit = this.resolveWantsHomeVisit(offering, input.customerAreaId);
    if (wantsHomeVisit) {
      if (!input.customerAreaId || !input.customerAddress) {
        // 422, not 400 — the request is well-formed (schema-valid), but this
        // particular offering (home_visit, per offering.location_mode) can't
        // be fulfilled without a service area + address (Task 8: DTO keeps
        // customer_address optional since the schema can't know the
        // offering's location_mode; this is the service-side enforcement).
        // Keyed on the OFFERING's location_mode, not the client-supplied
        // customerAreaId — a home_visit-only offering requires an address
        // even if the client forgot to send customerAreaId (previously that
        // omission fell through to the availability engine, which returns 0
        // slots for a location_mode mismatch, surfacing as a confusing 409
        // instead of this actionable 422).
        throw new UnprocessableEntityError("customerAddress is required for home-visit bookings");
      }
    } else if (!input.locationId) {
      throw new BadRequestError("locationId is required for at-premises bookings");
    }

    // pay_at_venue's strike gate is checked BEFORE touching the DB/hold — a
    // blocked customer should never end up with a stranded pending_payment
    // booking they can't confirm via this mode (they'd need to retry with
    // deposit/prepay instead, using the same still-live hold).
    if (offering.payment_mode === ServicePaymentMode.pay_at_venue) {
      const gate = await this.checkPayAtVenueAllowed(customerId, offering.vendor_id);
      if (!gate.allowed) throw new PayAtVenueUnavailableError();
    }

    const staffMemberId = await this.resolveStaffForSlot(offering, {
      wantsHomeVisit,
      locationId: input.locationId,
      customerAreaId: input.customerAreaId,
      staffMemberId: input.staffMemberId,
      startsAt,
      endsAt,
      now,
    });

    // Bind the hold to the EXACT staff+slot about to be booked — assertHeld
    // (token-only) would pass for a live hold on any staff/slot, letting a
    // client hold slot A for staff X and then book a different staff/slot
    // with that same token. assertHeldFor reconstructs `hold:{staff}:{range}`
    // the same way BookingHoldService.hold() wrote it and rejects a mismatch
    // with ConflictError (409) — the GiST EXCLUDE constraint is still the
    // real backstop, but the hold should mean what it claims to mean.
    await this.holdService.assertHeldFor(input.holdToken, staffMemberId, {
      start: startsAt,
      end: endsAt,
    });

    // Travel buffer only applies to home-visit; mirrors AvailabilityService's
    // own lookup (small, duplicated here rather than exposing a new public
    // method on AvailabilityService for one field — see Task 5 report).
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

    // ── Price/VAT/deposit snapshot ──
    // price_fils is VAT-inclusive (matches order-service convention — see
    // CommissionService.createForOrderItemInTx's netExVat comment); vat_fils
    // is the extracted component, not added on top.
    const priceFils = offering.price_fils;
    const vatRate = Number(offering.vat_rate);
    const netExVatFils = Math.round(priceFils / (1 + vatRate / 100));
    const vatFils = priceFils - netExVatFils;
    const depositFils =
      offering.deposit_type === DepositType.percent
        ? Math.round(priceFils * (offering.deposit_value / 100))
        : offering.deposit_type === DepositType.fixed
          ? offering.deposit_value
          : 0;

    const commission = await this.commissionSnapshot.resolve({
      vendorId: offering.vendor_id,
      categoryId: offering.category_id,
      netAmountFils: netExVatFils,
    });

    // Prepay/deposit need the customer's email (prepay's SetupIntent schema
    // requires it) and benefit from name/address for Stripe's cross-border
    // compliance requirement (see booking-payment.client.ts). Fetched before
    // the transaction so a missing user fails fast without a stray booking row.
    let user: User | null = null;
    if (offering.payment_mode !== ServicePaymentMode.pay_at_venue) {
      user = await this.userRepo.findOne({ where: { id: customerId } });
      if (!user) throw new NotFoundError("Customer not found");
    }

    let engagement: StaffEngagement;
    let booking: Booking;
    try {
      const result = await this.bookingRepo.manager.transaction(async (manager) => {
        const engagementRepo = manager.getRepository(StaffEngagement);
        const bookingRepoTx = manager.getRepository(Booking);
        const engagementService = new EngagementService(engagementRepo, this.cache);

        const engagementRow = await engagementService.reserve({
          staffMemberId,
          vendorId: offering.vendor_id,
          startsAt: engagementStartsAt,
          endsAt: engagementEndsAt,
          kind: EngagementKind.marketplace_booking,
          status: EngagementStatus.held,
          createdBy: customerId,
        });

        const bookingRow = await bookingRepoTx.save(
          bookingRepoTx.create({
            booking_number: generateBookingNumber(),
            customer_user_id: customerId,
            vendor_id: offering.vendor_id,
            location_id: wantsHomeVisit ? null : (input.locationId ?? null),
            customer_address: wantsHomeVisit ? (input.customerAddress ?? null) : null,
            staff_member_id: staffMemberId,
            engagement_id: engagementRow.id,
            service_offering_id: offering.id,
            service_name: offering.name,
            duration_minutes: offering.duration_minutes,
            price_fils: priceFils,
            vat_fils: vatFils,
            deposit_fils: depositFils,
            deposit_type: offering.deposit_type,
            cancellation_window_hours: offering.cancellation_window_hours,
            cancellation_refund_policy: offering.cancellation_refund_policy,
            cancellation_penalty_percent: offering.cancellation_penalty_percent,
            reschedule_window_hours: offering.reschedule_window_hours,
            commission_rate: commission.rate,
            commission_fils: commission.amountFils,
            commission_type: commission.type,
            starts_at: startsAt,
            ends_at: endsAt,
            status: BookingStatus.pending_payment,
            source: "marketplace",
            payment_mode: offering.payment_mode,
            notes: input.notes ?? null,
          }),
        );

        return { engagement: engagementRow, booking: bookingRow };
      });
      engagement = result.engagement;
      booking = result.booking;
    } catch (err) {
      // Release on ANY transaction failure, not just the EXCLUDE-constraint
      // ConflictError — an unrelated failure (DB error, validation bug, etc.)
      // must not strand the hold for its full 10-minute TTL. release() is a
      // compare-and-delete keyed by token, so this is safe to call even if
      // the hold was already released elsewhere; the original error is
      // rethrown unchanged either way.
      await this.holdService.release(input.holdToken).catch(() => undefined);
      throw err;
    }

    // The booking row now durably exists (or the reaper will expire it) —
    // the Redis hold has done its job regardless of payment_mode.
    await this.holdService.release(input.holdToken).catch(() => undefined);

    if (offering.payment_mode === ServicePaymentMode.pay_at_venue) {
      await this.confirmPayAtVenue(booking, engagement, customerId);
      return { booking, engagement, clientSecret: null };
    }

    const address =
      (input.customerAddress as { line1?: string; city?: string; country?: string } | null) ?? null;
    const name =
      user && (user.first_name || user.last_name)
        ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
        : null;

    if (offering.payment_mode === ServicePaymentMode.deposit) {
      const intent = await this.paymentClient.intent({
        bookingId: booking.id,
        userId: customerId,
        amountFils: depositFils,
        currency: "AED",
        name,
        address,
      });
      await this.bookingRepo.update({ id: booking.id }, { payment_id: intent.paymentId });
      booking.payment_id = intent.paymentId;
      return {
        booking,
        engagement,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
      };
    }

    // prepay
    const setup = await this.paymentClient.setup({
      bookingId: booking.id,
      userId: customerId,
      email: (user as User).email,
      name,
      address,
    });
    await this.bookingRepo.update({ id: booking.id }, { payment_id: setup.paymentId });
    booking.payment_id = setup.paymentId;
    return {
      booking,
      engagement,
      clientSecret: setup.clientSecret,
      setupIntentId: setup.setupIntentId,
    };
  }

  // POST /bookings/hold (Task 8) — soft-locks a staff+slot in Redis while the
  // customer completes checkout (spec §5.1 step 2). Shares offering-load,
  // slot-window validation, and staff resolution with create() via the
  // private helpers below — the only things unique to hold() are the actual
  // Redis SETNX and the (non-throwing) allowed_payment_modes computation, so
  // checkout can render copy explaining an unavailable pay_at_venue mode
  // BEFORE the customer fills in payment details, with create()'s
  // `422 pay_at_venue_unavailable` still the enforcement backstop.
  async hold(customerId: string, input: HoldBookingInput): Promise<HoldBookingResult> {
    const now = input.now ?? new Date();

    const offering = await this.loadPublishedOffering(input.offeringId);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    this.validateSlotWindow(offering, startsAt, endsAt);

    const wantsHomeVisit = this.resolveWantsHomeVisit(offering, input.customerAreaId);
    if (wantsHomeVisit) {
      // hold() doesn't collect customer_address (see HoldBookingInput's
      // header comment — that only makes sense once actually creating the
      // booking), but it DOES need customerAreaId to resolve staff/timezone
      // for a home-visit slot. Same 422 (not the availability engine's
      // silent 0-slots) for the same reason as create(): a home_visit-only
      // offering requested without customerAreaId must fail loud, here,
      // rather than fall through to a misleading 409.
      if (!input.customerAreaId) {
        throw new UnprocessableEntityError("customerAddress is required for home-visit bookings");
      }
    } else if (!input.locationId) {
      throw new BadRequestError("locationId is required for at-premises bookings");
    }

    const staffMemberId = await this.resolveStaffForSlot(offering, {
      wantsHomeVisit,
      locationId: input.locationId,
      customerAreaId: input.customerAreaId,
      staffMemberId: input.staffMemberId,
      startsAt,
      endsAt,
      now,
    });

    const token = await this.holdService.hold(staffMemberId, { start: startsAt, end: endsAt });
    if (!token) {
      throw new ConflictError(
        "This slot is currently held by another customer — try again shortly",
      );
    }

    // Informational only (unlike create()'s hard gate) — always
    // [offering.payment_mode] until Phase 5's real strike gate replaces
    // checkPayAtVenueAllowed, except when that gate blocks a pay_at_venue-only
    // offering, in which case the array is empty (nothing valid to render).
    let allowedPaymentModes: ServicePaymentMode[] = [offering.payment_mode];
    if (offering.payment_mode === ServicePaymentMode.pay_at_venue) {
      const gate = await this.checkPayAtVenueAllowed(customerId, offering.vendor_id);
      if (!gate.allowed) allowedPaymentModes = [];
    }

    return {
      holdToken: token,
      expiresInSeconds: HOLD_TTL_SECONDS,
      staffMemberId,
      allowedPaymentModes,
    };
  }

  // Whether THIS booking should be treated as home-visit — keyed on the
  // OFFERING's location_mode (the source of truth, same field
  // AvailabilityService itself gates on), not the client-supplied
  // customerAreaId alone. Shared by create() and hold() so both enforce the
  // customer_address/customer_area_id requirement identically:
  //   - home_visit: ALWAYS home-visit, regardless of what the client sent —
  //     a missing customerAreaId/customerAddress is then a validation error
  //     (422) at the call site below, not a silent "at premises" misread
  //     that falls through to the availability engine (which would return
  //     zero slots for the location_mode mismatch and surface as a
  //     confusing 409).
  //   - at_premises: NEVER home-visit, even if the client mistakenly sends
  //     customerAreaId — this is the reverse false-positive the review
  //     flagged (an at_premises offering must not throw the home-visit
  //     address error just because of a stray customerAreaId).
  //   - either: home-visit only when the client opts in by supplying
  //     customerAreaId; an either offering booked at-premises (no
  //     customerAreaId) is fine.
  private resolveWantsHomeVisit(
    offering: ServiceOffering,
    customerAreaId: string | null | undefined,
  ): boolean {
    if (offering.location_mode === ServiceLocationMode.home_visit) return true;
    if (offering.location_mode === ServiceLocationMode.at_premises) return false;
    return !!customerAreaId; // either
  }

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

  // Resolve an eligible + free staff member for this exact slot by reusing
  // the Phase 3 availability engine rather than re-deriving working-hours /
  // busy-time / eligibility logic here. Narrowing from/to to the requested
  // slot keeps this to "one day's worth of slot math", same cost as a normal
  // availability browse. Shared by create() and hold() — the only two call
  // sites that need "which staff member is free for this exact slot".
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

  // Phase 5 Task 5's real per-vendor no-show strike gate (spec §5.3), wired
  // through the StrikeService seam. pay_at_venue is revoked at a vendor once the
  // customer's DERIVED per-vendor no_show count reaches the per-vendor threshold,
  // or EVERYWHERE once their platform-wide count reaches the higher backstop.
  // Drives BOTH create()'s hard 422 `pay_at_venue_unavailable` and hold()'s
  // informational `allowed_payment_modes`. Falls back to "allowed" when no
  // StrikeService is wired (kept as a dedicated method so that fallback — and a
  // future DI swap — stays a one-liner).
  async checkPayAtVenueAllowed(
    customerId: string,
    vendorId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.strikeService) return { allowed: true };
    const gate = await this.strikeService.checkPayAtVenue(customerId, vendorId);
    return { allowed: !gate.blocked, reason: gate.reason };
  }

  // pay_at_venue's immediate confirm, now routed through Task 6's real state
  // machine via `BookingStatusService.confirmPayAtVenue` (Phase 5 final review
  // Fix 1) instead of the plain `transition()` it used before. That method
  // re-loads the booking, validates pending_payment->confirmed against spec
  // §5.3's allowed-edge set, confirms the engagement, writes the history row —
  // AND, crucially, fires the post-confirm hooks (auto-complete + reminder
  // scheduling, booking_confirmed/vendor_new_booking notifications) that plain
  // `transition()` never did. Before this fix, pay_at_venue bookings silently
  // got none of those: no auto-complete job (never completed -> zombie,
  // commission never accrued, review 403 forever), no reminders, no confirm
  // notifications. The hooks fire only on the winning transition (guarded
  // inside confirmPayAtVenue), so this is safe against a duplicate/losing call.
  private async confirmPayAtVenue(
    booking: Booking,
    engagement: StaffEngagement,
    actorId: string,
  ): Promise<void> {
    const updated = await this.statusService.confirmPayAtVenue(booking.id, {
      id: actorId,
      role: "customer",
    });
    booking.status = updated.status;
    engagement.status = EngagementStatus.confirmed;
  }
}
