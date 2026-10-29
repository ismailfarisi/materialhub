// manual-booking.service.ts
//
// Phase 6 Task 1 (spec off-platform capacity, Task 1 brief: "Manual walk-in /
// phone booking"). A vendor location manager records a walk-in/phone
// customer directly into the SAME `staff_engagement` capacity ledger every
// other engagement source (marketplace booking, external import, manual
// block) writes to, so staff are never double-promised across sources.
//
// ── Binding design decision (do not deviate) ────────────────────────────────
// CAPACITY ONLY. No commission accrual, no payment/escrow rows, no online
// payment, no Stripe. Every manual booking ALWAYS writes a `bookings` row
// (review I3): even a bare walk_in/phone engagement with no name/phone/service
// gets one, so it has a real booking id that admin cancel can reach — an
// engagement-only row is otherwise irrevocable (block delete kind-gates
// walk_in/phone to 404, cancel needs a booking id, no engagement admin
// endpoint exists) and permanently blocks the staff member's availability
// until its time passes. Writing the row unconditionally also stops a
// notes-only call from silently dropping the note (former Task-1 minor). The
// row is written directly at `confirmed` with its own status-history row
// (mirrors how BookingStatusService's
// transitionGuarded writes history, done here by hand since there's no
// `pending_payment` state to transition FROM). This deliberately does NOT
// route through BookingService.create()/BookingStatusService.confirmPayAtVenue
// — that path fires postConfirm hooks (auto-complete scheduling, reminder
// scheduling, booking_confirmed/vendor_new_booking notifications) which must
// never fire for a booking with no MaterialHub customer:
//   - auto-complete would eventually call completeBooking() -> the
//     BookingCompletionHook -> order-service's commission-accrual endpoint,
//     violating "no commission accrual".
//   - reminders/booking_confirmed target `booking.customer_user_id`, which is
//     null here.
// Because this service never calls postConfirm, none of those jobs get
// scheduled for a manual booking in the first place — the guards added
// elsewhere on this branch (booking-auth.service.ts's off-session-auth path,
// reminder-scheduler's scheduleForConfirm) are defense-in-depth for a code
// path that should be unreachable for these rows, not something this service
// depends on.
import {
  Booking,
  BookingStatus,
  BookingStatusHistory,
  CancellationRefundPolicy,
  CommissionType,
  DepositType,
  EngagementKind,
  EngagementStatus,
  type ServiceOffering,
  ServicePaymentMode,
  StaffEngagement,
  type StaffLocation,
  type StaffMember,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { AvailabilityCache } from "../availability/availability-cache.ts";
import { EngagementService } from "../engagement/engagement.service.ts";
import { assertSaneEngagementSpan } from "./block-time.service.ts";

export interface ManualBookingActor {
  userId: string;
  vendorId: string;
  role: string;
}

export interface CreateManualBookingInput {
  staffMemberId: string;
  vendorLocationId: string;
  serviceId?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  // walk_in | phone only — validated by the DTO's literal union; typed as the
  // narrower EngagementKind here since that's what EngagementService.reserve
  // and the `bookings.source` column both expect.
  kind: EngagementKind;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
}

export interface CreateManualBookingResult {
  engagement: StaffEngagement;
  // Always present since review I3 — every manual booking writes a `bookings`
  // row so it carries a cancelable booking id (see the header). A bare walk-in
  // with no details still gets a minimal row.
  booking: Booking;
}

function generateWalkInBookingNumber(): string {
  // "WK" prefix (distinct from BookingService's "BK") so a manual booking's
  // number is visibly non-marketplace at a glance in the vendor calendar/CSV
  // exports, mirroring generateBookingNumber's own timestamp+random shape.
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WK${ts}${rand}`.slice(0, 30);
}

// Fields snapshotted onto the `bookings` row (mirrors BookingService.create's
// price/vat/deposit/policy/commission snapshot block) — split out so both the
// service-given and no-service branches assemble the exact same column set.
interface BookingSnapshot {
  service_name: string;
  duration_minutes: number;
  price_fils: number;
  vat_fils: number;
  deposit_fils: number;
  deposit_type: DepositType;
  cancellation_window_hours: number;
  cancellation_refund_policy: CancellationRefundPolicy;
  cancellation_penalty_percent: number;
  reschedule_window_hours: number;
  commission_rate: number;
  commission_fils: number;
  commission_type: CommissionType;
}

// commission_rate/commission_fils are always 0 here — NOT a real snapshot of
// the vendor's commission policy (contrast BookingService.create's
// CommissionSnapshotService.resolve call). Capacity-only bookings never
// accrue commission (the binding decision above), so resolving a real rate
// here would be dead data at best and misleading at worst.
const ZERO_COMMISSION = {
  commission_rate: 0,
  commission_fils: 0,
  commission_type: CommissionType.percentage,
} as const;

export class ManualBookingService {
  constructor(
    private readonly staffRepo: Repository<StaffMember>,
    private readonly staffLocationRepo: Repository<StaffLocation>,
    private readonly offeringRepo: Repository<ServiceOffering>,
    private readonly bookingRepo: Repository<Booking>,
    private readonly cache?: AvailabilityCache,
  ) {}

  async create(
    actor: ManualBookingActor,
    input: CreateManualBookingInput,
    now: Date = new Date(),
  ): Promise<CreateManualBookingResult> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    // Review finding 6 — `startsAt < endsAt` alone let a single call reserve a
    // centuries-long slot_range, permanently 409ing every later booking for
    // that staff member via the `no_double_book` exclusion constraint. It also
    // fed an unbounded minute count into `bookings.duration_minutes` (int4),
    // turning an absurd span into an unhandled Postgres 22003 numeric-overflow
    // 500 instead of a 400. Same bound as BlockTimeService.create — both write
    // the same ledger through the same constraint.
    assertSaneEngagementSpan(startsAt, endsAt, now);

    const staff = await this.staffRepo.findOne({
      where: { id: input.staffMemberId, vendor_id: actor.vendorId },
    });
    if (!staff) throw new NotFoundError("Staff member not found");

    const link = await this.staffLocationRepo.findOne({
      where: { staff_member_id: staff.id, vendor_location_id: input.vendorLocationId },
    });
    if (!link) {
      throw new BadRequestError("Staff member is not linked to this location");
    }

    let offering: ServiceOffering | null = null;
    if (input.serviceId) {
      offering = await this.offeringRepo.findOne({
        where: { id: input.serviceId, vendor_id: actor.vendorId },
      });
      if (!offering) throw new NotFoundError("Service offering not found");
    }

    return this.bookingRepo.manager.transaction(async (manager) => {
      const engagementRepo = manager.getRepository(StaffEngagement);
      const engagementService = new EngagementService(engagementRepo, this.cache);

      // Overlap -> EngagementService.reserve's own 23P01 -> ConflictError
      // (409) mapping propagates unchanged; this transaction rolls back with
      // nothing written, matching BookingService.create's own contract.
      const engagement = await engagementService.reserve({
        staffMemberId: staff.id,
        vendorId: actor.vendorId,
        startsAt,
        endsAt,
        kind: input.kind,
        status: EngagementStatus.confirmed,
        createdBy: actor.userId,
      });

      // Always write the booking row (review I3) — even a bare walk-in with no
      // name/phone/service, so it has a cancelable id and its `notes` are
      // never dropped. A service gives a real price/policy snapshot; without
      // one we fall back to a zero-money minimal snapshot.
      const bookingRepoTx = manager.getRepository(Booking);
      const historyRepo = manager.getRepository(BookingStatusHistory);

      const snapshot = offering
        ? this.snapshotFromOffering(offering)
        : this.minimalSnapshot(input.kind, startsAt, endsAt);

      const booking = await bookingRepoTx.save(
        bookingRepoTx.create({
          booking_number: generateWalkInBookingNumber(),
          customer_user_id: null,
          customer_name: input.customerName ?? null,
          customer_phone: input.customerPhone ?? null,
          vendor_id: actor.vendorId,
          location_id: input.vendorLocationId,
          customer_address: null,
          staff_member_id: staff.id,
          engagement_id: engagement.id,
          service_offering_id: offering?.id ?? null,
          starts_at: startsAt,
          ends_at: endsAt,
          status: BookingStatus.confirmed,
          // 'walk_in' | 'phone' — matches EngagementKind's string values
          // exactly (see booking.entity.ts's `source` column comment).
          source: input.kind,
          payment_mode: ServicePaymentMode.pay_at_venue,
          notes: input.notes ?? null,
          ...snapshot,
        }),
      );

      await historyRepo.save(
        historyRepo.create({
          booking_id: booking.id,
          from_status: null,
          to_status: BookingStatus.confirmed,
          actor_id: actor.userId,
          actor_role: "vendor",
          reason: `Manual ${input.kind} booking created by vendor staff`,
        }),
      );

      return { engagement, booking };
    });
  }

  private snapshotFromOffering(offering: ServiceOffering): BookingSnapshot {
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

    return {
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
      ...ZERO_COMMISSION,
    };
  }

  // No service picked yet (e.g. a phone booking taken before the customer
  // decides) — a minimal row satisfying every NOT NULL column sensibly: zero
  // money, no cancellation policy (there's no online payment/checkout to
  // apply one to), duration derived from the slot itself rather than an
  // offering.
  private minimalSnapshot(kind: EngagementKind, startsAt: Date, endsAt: Date): BookingSnapshot {
    const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
    return {
      service_name: kind === EngagementKind.walk_in ? "Walk-in" : "Phone booking",
      duration_minutes: durationMinutes,
      price_fils: 0,
      vat_fils: 0,
      deposit_fils: 0,
      deposit_type: DepositType.none,
      cancellation_window_hours: 0,
      cancellation_refund_policy: CancellationRefundPolicy.full,
      cancellation_penalty_percent: 100,
      reschedule_window_hours: 0,
      ...ZERO_COMMISSION,
    };
  }
}
