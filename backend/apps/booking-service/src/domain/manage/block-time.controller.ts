// block-time.controller.ts
//
// Phase 6 Task 2 — thin controller wiring the location-scoped
// `assertLocationManager` guard for block creation, mirroring
// manual-booking.controller.ts (Task 1's own precedent). `list`/`delete`
// have no location id to gate on here at the controller layer
// (staff_engagements carries no location column) — BlockTimeService derives
// the relevant location(s) itself (from the queried `vendor_location_id`, or
// from the target engagement's staff member's linked locations) and runs the
// same location-manager check there; see block-time.service.ts's header
// comment for the full authorization boundary for those two operations.
import type { EngagementKind } from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
import { type LocationScopeRepos, assertLocationManager } from "../../guards/location-scope.ts";
import type {
  BlockTimeActor,
  BlockTimeService,
  CreateBlockInput,
  ListBlocksQuery,
} from "./block-time.service.ts";

export interface CreateBlockRequest {
  staff_member_id: string;
  vendor_location_id: string;
  starts_at: string;
  ends_at: string;
  kind: EngagementKind;
  reason?: string | null;
}

export interface ListBlocksRequestQuery {
  staff_member_id?: string;
  vendor_location_id?: string;
  from?: string;
  to?: string;
}

export class BlockTimeController {
  constructor(
    private readonly svc: BlockTimeService,
    private readonly locationScope: LocationScopeRepos,
  ) {}

  async create(actor: BlockTimeActor, body: CreateBlockRequest) {
    await assertLocationManager(actor, body.vendor_location_id, this.locationScope);

    const input: CreateBlockInput = {
      staffMemberId: body.staff_member_id,
      vendorLocationId: body.vendor_location_id,
      startsAt: body.starts_at,
      endsAt: body.ends_at,
      kind: body.kind,
      reason: body.reason ?? null,
    };
    return this.svc.create(actor, input);
  }

  list(actor: BlockTimeActor, query: ListBlocksRequestQuery) {
    if (!query.from || !query.to) {
      throw new BadRequestError("from and to query params are required");
    }
    const listQuery: ListBlocksQuery = {
      staffMemberId: query.staff_member_id || undefined,
      vendorLocationId: query.vendor_location_id || undefined,
      from: query.from,
      to: query.to,
    };
    return this.svc.list(actor, listQuery);
  }

  delete(actor: BlockTimeActor, id: string) {
    return this.svc.delete(actor, id);
  }
}
