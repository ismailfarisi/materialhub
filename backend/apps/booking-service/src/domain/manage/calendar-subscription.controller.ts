// calendar-subscription.controller.ts
//
// Phase 6 Task 4 — thin controller for the staff calendar-subscription CRUD.
// Unlike ManualBooking/BlockTime controllers, the location-scoped check lives
// inside CalendarSubscriptionService (it derives the staff member's linked
// locations itself, since the route carries a staff id, not a location id) —
// see that service's header. This controller just adapts request shapes.
import type {
  CalendarSubscriptionActor,
  CalendarSubscriptionService,
} from "./calendar-subscription.service.ts";

export class CalendarSubscriptionController {
  constructor(private readonly svc: CalendarSubscriptionService) {}

  upsert(actor: CalendarSubscriptionActor, staffMemberId: string, body: { ical_url: string }) {
    return this.svc.upsert(actor, staffMemberId, body.ical_url);
  }

  get(actor: CalendarSubscriptionActor, staffMemberId: string) {
    return this.svc.get(actor, staffMemberId);
  }

  remove(actor: CalendarSubscriptionActor, staffMemberId: string) {
    return this.svc.remove(actor, staffMemberId);
  }
}
