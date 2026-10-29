// manual-booking.controller.ts
//
// Phase 6 Task 1 — thin controller wiring the two guards a manual walk-in/
// phone booking needs: vendor-level `products.write` (route-level, see
// manual-booking.routes.ts) PLUS the location-scoped
// `assertLocationManager` check (mirrors StaffController.linkLocation —
// staff.controller.ts — the precedent the Task 1 brief points at). A vendor
// owner/manager passes for any of their vendor's branches; a per-location
// manager (location_membership) passes only for THEIR branch.
import type { EngagementKind } from "@materialhub/database";
import { type LocationScopeRepos, assertLocationManager } from "../../guards/location-scope.ts";
import type {
  CreateManualBookingInput,
  ManualBookingActor,
  ManualBookingService,
} from "./manual-booking.service.ts";

export interface CreateManualBookingRequest {
  staff_member_id: string;
  vendor_location_id: string;
  service_id?: string | null;
  starts_at: string;
  ends_at: string;
  kind: EngagementKind;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
}

export class ManualBookingController {
  constructor(
    private readonly svc: ManualBookingService,
    private readonly locationScope: LocationScopeRepos,
  ) {}

  async create(actor: ManualBookingActor, body: CreateManualBookingRequest) {
    await assertLocationManager(actor, body.vendor_location_id, this.locationScope);

    const input: CreateManualBookingInput = {
      staffMemberId: body.staff_member_id,
      vendorLocationId: body.vendor_location_id,
      serviceId: body.service_id ?? null,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      kind: body.kind,
      customerName: body.customer_name ?? null,
      customerPhone: body.customer_phone ?? null,
      notes: body.notes ?? null,
    };
    return this.svc.create(actor, input);
  }
}
