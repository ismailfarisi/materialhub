// calendar-feed-url.service.ts
//
// Phase 6 Task 5 — issues the signed outbound `.ics` feed URL for a staff
// member, for a vendor location manager to paste into their other platform's
// "subscribe to calendar" field. Deterministic: calling `issue` again for the
// same staff member returns the SAME URL every time — the token is a pure
// HMAC over the staff id (ical-feed-token.ts) with no stored/rotatable
// per-issue state, so there's nothing to look up or regenerate.
//
// ── Scoping (mirrors CalendarSubscriptionService.assertStaffAccess) ─────────
// staff_engagements/staff_members carry no location column directly usable
// here, so a non-owner/manager actor is authorized against the staff
// member's LINKED locations: they must hold a managing location_membership
// for EVERY one of them (isLocationManagerOfAll — see review finding 7; this
// URL embeds a bearer token granting read of the staff member's whole
// schedule across all their branches, so ANY-branch authority was too weak).
// Owner/vendor-manager keep the unrestricted fast path. This duplicates
// CalendarSubscriptionService's private `assertStaffAccess` rather than
// importing it — that method is private, and the two services address
// different concerns (inbound subscription CRUD vs. outbound feed URL
// issuance) that happen to share the same authorization shape. Both go
// through the same underlying `isVendorManagerRole`/`isLocationManagerOfAll`
// helpers from guards/location-scope.ts, so the actual authorization LOGIC
// is not duplicated, only the staff-lookup plumbing around it.
import type { StaffLocation, StaffMember } from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import {
  type LocationScopeRepos,
  isLocationManagerOfAll,
  isVendorManagerRole,
} from "../../guards/location-scope.ts";
import { signIcalFeedToken } from "../calendar/ical-feed-token.ts";

export interface CalendarFeedUrlActor {
  userId: string;
  vendorId: string;
  role: string;
}

export interface IssuedCalendarFeedUrl {
  url: string;
}

export class CalendarFeedUrlService {
  constructor(
    private readonly staffRepo: Repository<StaffMember>,
    private readonly staffLocationRepo: Repository<StaffLocation>,
    private readonly locationScope: LocationScopeRepos,
    private readonly feedSecret: string,
    private readonly publicApiBaseUrl: string,
  ) {}

  async issue(actor: CalendarFeedUrlActor, staffMemberId: string): Promise<IssuedCalendarFeedUrl> {
    const staff = await this.assertStaffAccess(actor, staffMemberId);
    const token = signIcalFeedToken(this.feedSecret, staff.id);
    const base = this.publicApiBaseUrl.replace(/\/+$/, "");
    return {
      url: `${base}/calendar/staff/${staff.id}/feed.ics?token=${encodeURIComponent(token)}`,
    };
  }

  // Vendor-scoped staff load + location-manager check — same shape and same
  // "don't leak existence" contract (404, never 403, for an unauthorized
  // non-manager) as CalendarSubscriptionService.assertStaffAccess.
  private async assertStaffAccess(
    actor: CalendarFeedUrlActor,
    staffMemberId: string,
  ): Promise<StaffMember> {
    const staff = await this.staffRepo.findOne({
      where: { id: staffMemberId, vendor_id: actor.vendorId },
    });
    if (!staff) throw new NotFoundError("Staff member not found");

    if (!isVendorManagerRole(actor.role)) {
      const links = await this.staffLocationRepo.find({
        where: { staff_member_id: staff.id },
      });
      const authorized = await isLocationManagerOfAll(
        actor,
        links.map((link) => link.vendor_location_id),
        this.locationScope,
      );
      if (!authorized) {
        throw new NotFoundError("Staff member not found");
      }
    }

    return staff;
  }
}
