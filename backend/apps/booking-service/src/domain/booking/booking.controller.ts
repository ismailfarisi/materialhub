// booking.controller.ts
//
// Thin controller for the customer-facing booking APIs (Phase 4 Task 8).
// Translates the snake_case wire DTOs (@materialhub/dto's BookingHoldBody /
// CreateBookingBody) into the camelCase inputs BookingService/BookingQueryService
// expect, and back. customerId is ALWAYS the caller-supplied value derived by
// the route from the verified JWT (`user.id`) — never trust a body field for it.
import type {
  BookingHoldBody,
  CancelBookingBody,
  CreateBookingBody,
  MyBookingsQuery,
  NoShowBookingBody,
  RescheduleBookingBody,
} from "@materialhub/dto";
import type { BookingQueryService } from "./booking-query.service.ts";
import type { BookingActor } from "./booking-status.service.ts";
import type { BookingService, HoldBookingResult } from "./booking.service.ts";
import type { CancelService } from "./cancel.service.ts";
import type { NoShowService } from "./no-show.service.ts";
import type { RescheduleService } from "./reschedule.service.ts";

function holdResponse(result: HoldBookingResult) {
  return {
    hold_token: result.holdToken,
    expires_in_seconds: result.expiresInSeconds,
    staff_member_id: result.staffMemberId,
    allowed_payment_modes: result.allowedPaymentModes,
  };
}

export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly bookingQueryService: BookingQueryService,
    private readonly rescheduleService: RescheduleService,
    private readonly cancelService: CancelService,
    private readonly noShowService: NoShowService,
  ) {}

  async hold(customerId: string, body: BookingHoldBody) {
    const result = await this.bookingService.hold(customerId, {
      offeringId: body.offering_id,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      staffMemberId: body.staff_member_id ?? undefined,
      locationId: body.location_id ?? undefined,
      customerAreaId: body.customer_area_id ?? undefined,
    });
    return holdResponse(result);
  }

  async create(customerId: string, body: CreateBookingBody) {
    const result = await this.bookingService.create(customerId, {
      offeringId: body.offering_id,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      staffMemberId: body.staff_member_id ?? undefined,
      locationId: body.location_id ?? undefined,
      customerAreaId: body.customer_area_id ?? undefined,
      customerAddress: body.customer_address ?? undefined,
      holdToken: body.hold_token,
      notes: body.notes ?? undefined,
    });
    return {
      booking: result.booking,
      client_secret: result.clientSecret,
      payment_intent_id: result.paymentIntentId ?? null,
      setup_intent_id: result.setupIntentId ?? null,
    };
  }

  // actor is derived by the route from the verified JWT (id + role). The
  // service enforces the customer reschedule window (admins bypass it) and
  // ownership scoping (a customer's not-owned booking reads as 404).
  async reschedule(actor: BookingActor, id: string, body: RescheduleBookingBody) {
    const result = await this.rescheduleService.reschedule(
      id,
      {
        startsAt: body.starts_at,
        endsAt: body.ends_at,
        staffMemberId: body.staff_member_id ?? undefined,
        locationId: body.location_id ?? undefined,
        customerAreaId: body.customer_area_id ?? undefined,
        holdToken: body.hold_token,
      },
      actor,
    );
    return { booking: result.booking };
  }

  // actor is derived by the route from the verified JWT (id + role). The
  // service enforces the customer cancellation policy (out-of-window customer
  // cancel is allowed but forfeits per policy; admins bypass the window → full
  // refund) and ownership scoping (a customer's not-owned booking reads as 404).
  async cancel(actor: BookingActor, id: string, body: CancelBookingBody) {
    const result = await this.cancelService.cancel(id, actor, { reason: body.reason ?? null });
    return {
      booking: result.booking,
      within_window: result.withinWindow,
      refund_fils: result.refundFils,
      forfeit_fils: result.forfeitFils,
      action: result.action,
    };
  }

  // actor is derived by the route from the verified JWT (id + role). The route's
  // requireRole excludes customers; NoShowService also rejects a customer actor
  // defensively. Enforces the [starts_at, ends_at+grace) window and forfeits per
  // the snapshotted policy (no ownership scoping — the caller is staff).
  async markNoShow(actor: BookingActor, id: string, body: NoShowBookingBody) {
    const result = await this.noShowService.markNoShow(id, actor, {
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

  listMine(customerId: string, query: MyBookingsQuery) {
    return this.bookingQueryService.list(customerId, query);
  }

  getOwn(customerId: string, id: string) {
    return this.bookingQueryService.getById(id, customerId);
  }
}
