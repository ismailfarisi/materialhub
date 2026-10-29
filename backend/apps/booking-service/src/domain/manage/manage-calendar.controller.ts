// manage-calendar.controller.ts
//
// Task 0A (Phase 7 backend prerequisite) — thin controller for GET
// /manage/calendar, mirroring BlockTimeController's shape (query param
// snake_case -> camelCase translation only; all validation/authorization
// lives in ManageCalendarService, same split block-time.controller.ts uses).
import type {
  CalendarActor,
  ListCalendarQuery,
  ManageCalendarService,
} from "./manage-calendar.service.ts";

export interface ListCalendarRequestQuery {
  from?: string;
  to?: string;
  staff_member_id?: string;
  vendor_location_id?: string;
}

export class ManageCalendarController {
  constructor(private readonly svc: ManageCalendarService) {}

  list(actor: CalendarActor, query: ListCalendarRequestQuery) {
    const listQuery: ListCalendarQuery = {
      from: query.from,
      to: query.to,
      staffMemberId: query.staff_member_id || undefined,
      vendorLocationId: query.vendor_location_id || undefined,
    };
    return this.svc.list(actor, listQuery);
  }
}
