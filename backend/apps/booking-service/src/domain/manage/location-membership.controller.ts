// location-membership.controller.ts
//
// Task 0B (Phase 7) — thin controller for the location-membership CRUD routes,
// mirroring block-time.controller.ts's split (snake_case body -> camelCase
// input translation only; all authorization/validation lives in
// LocationMembershipService).
import type { CreateLocationMembershipBody } from "@materialhub/dto";
import type {
  LocationMembershipActor,
  LocationMembershipService,
} from "./location-membership.service.ts";

export class LocationMembershipController {
  constructor(private readonly svc: LocationMembershipService) {}

  // GET /manage/my-location-memberships — self-scoped, no locationId param.
  listMine(actor: LocationMembershipActor) {
    return this.svc.listMine(actor);
  }

  list(actor: LocationMembershipActor, locationId: string) {
    return this.svc.list(actor, locationId);
  }

  create(actor: LocationMembershipActor, locationId: string, body: CreateLocationMembershipBody) {
    return this.svc.create(actor, locationId, { userId: body.user_id, role: body.role });
  }

  delete(actor: LocationMembershipActor, locationId: string, membershipId: string) {
    return this.svc.delete(actor, locationId, membershipId);
  }
}
