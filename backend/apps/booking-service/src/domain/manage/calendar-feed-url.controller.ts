// calendar-feed-url.controller.ts
//
// Phase 6 Task 5 — thin controller for issuing the outbound calendar feed
// URL. Mirrors calendar-subscription.controller.ts's shape: the
// location-scoped check lives inside CalendarFeedUrlService (it derives the
// staff member's linked locations itself, since the route carries a staff
// id, not a location id).
import type { CalendarFeedUrlActor, CalendarFeedUrlService } from "./calendar-feed-url.service.ts";

export class CalendarFeedUrlController {
  constructor(private readonly svc: CalendarFeedUrlService) {}

  issue(actor: CalendarFeedUrlActor, staffMemberId: string) {
    return this.svc.issue(actor, staffMemberId);
  }
}
