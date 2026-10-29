// calendar-subscription.service.ts
//
// Phase 6 Task 4 — CRUD for a staff member's external calendar subscription on
// the /manage surface. A vendor location manager registers/replaces (PUT),
// reads (GET), or removes (DELETE) the iCal URL the Task 4 poller pulls into
// the capacity ledger.
//
// ── Scoping (mirrors block-time.service.ts's staff->location derivation) ─────
// staff_calendar_subscriptions has no location column, so a non-owner/manager
// actor is authorized against the staff member's LINKED locations: they must
// hold a managing location_membership for EVERY one of them
// (isLocationManagerOfAll — review finding 7; under the previous ANY rule a
// single-branch admin could replace another branch's iCal subscription and
// read the secret it holds). Owner/vendor-manager keep the unrestricted fast
// path. Every op is additionally vendor_id-scoped (a different vendor's staff
// reads as 404).
//
// ── GET never returns the raw ical_url (review finding 8) ───────────────────
// A Google/Outlook/Fresha "private address" iCal URL embeds an unauthenticated
// capability token: anyone holding the string can read that person's entire
// personal calendar, forever, from anywhere, with no audit trail. It is a
// bearer secret, so `get()` returns a REDACTED view (host + a masked path,
// plus `is_configured`) and the full value never leaves the service. Callers
// that need the real URL (the poller) read the entity from the repository
// directly.
//
// ── DELETE frees capacity immediately ───────────────────────────────────────
// Removing a subscription soft-deletes the row AND releases every engagement it
// imported (external_source = subscription.id, status IN held/confirmed/
// conflicted) in the same call — a removed feed must not leave phantom busy
// blocks on the calendar. Immediate (not deferred to the next tick) so the
// freed slots are bookable at once.
//
// ── PUT SSRF gate (review fix cycle 1, finding I-1) ───────────────────────────
// upsert() runs assertSafeIcalUrl (ical-fetch-guard.ts) after the scheme check,
// best-effort: an immediate 400 on an obviously private/reserved/metadata
// address beats a silent failing subscription the vendor only discovers via
// GET's last_sync_error later. The poller's own re-validation (on every fetch
// AND every redirect hop) remains the authoritative guard — DNS can change
// between this call and the next tick.
import {
  EngagementKind,
  EngagementStatus,
  type StaffCalendarSubscription,
  type StaffEngagement,
  type StaffLocation,
  type StaffMember,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import { In, type Repository } from "typeorm";
import {
  type LocationScopeRepos,
  isLocationManagerOfAll,
  isVendorManagerRole,
} from "../../guards/location-scope.ts";
import type { AvailabilityCache } from "../availability/availability-cache.ts";
import { assertSafeIcalUrl } from "../calendar/ical-fetch-guard.ts";
import { EngagementService } from "../engagement/engagement.service.ts";

export interface CalendarSubscriptionActor {
  userId: string;
  vendorId: string;
  role: string;
}

// What GET is allowed to disclose: everything the dashboard needs to render
// "connected / last synced / last error" WITHOUT the bearer secret itself.
export interface RedactedCalendarSubscription {
  id: string;
  staff_member_id: string;
  vendor_id: string;
  is_active: boolean;
  is_configured: boolean;
  // Origin only (e.g. "https://calendar.google.com"), so the vendor can see
  // WHICH provider is connected, plus a fixed-length mask standing in for the
  // path+query that carry the token. Never the token, and never a
  // fixed-fraction reveal of it (a suffix/prefix of a capability token is
  // still key material).
  ical_url_masked: string;
  last_synced_at: Date | null;
  last_sync_error: string | null;
}

// Never reveals any part of the path or query — those are exactly where
// Google/Outlook put the token. An unparseable stored URL degrades to a bare
// mask rather than falling back to the raw string.
export function maskIcalUrl(icalUrl: string): string {
  try {
    const url = new URL(icalUrl);
    return `${url.protocol}//${url.host}/…`;
  } catch {
    return "…";
  }
}

function redact(subscription: StaffCalendarSubscription): RedactedCalendarSubscription {
  return {
    id: subscription.id,
    staff_member_id: subscription.staff_member_id,
    vendor_id: subscription.vendor_id,
    is_active: subscription.is_active,
    is_configured: Boolean(subscription.ical_url),
    ical_url_masked: maskIcalUrl(subscription.ical_url),
    last_synced_at: subscription.last_synced_at ?? null,
    last_sync_error: subscription.last_sync_error ?? null,
  };
}

export class CalendarSubscriptionService {
  constructor(
    private readonly staffRepo: Repository<StaffMember>,
    private readonly staffLocationRepo: Repository<StaffLocation>,
    private readonly subscriptionRepo: Repository<StaffCalendarSubscription>,
    private readonly engagementRepo: Repository<StaffEngagement>,
    private readonly locationScope: LocationScopeRepos,
    private readonly cache?: AvailabilityCache,
  ) {}

  // PUT — register or replace THE subscription for a staff member (one live per
  // staff, enforced by the partial unique index). Replacing with a different
  // URL resets last_synced_at + last_sync_error so the next tick re-syncs from
  // scratch against the new feed.
  async upsert(
    actor: CalendarSubscriptionActor,
    staffMemberId: string,
    icalUrl: string,
  ): Promise<RedactedCalendarSubscription> {
    const url = icalUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestError("ical_url must be an http(s) URL");
    }
    // Best-effort SSRF gate (review finding I-1): reject an obviously
    // private/reserved/loopback/metadata target immediately instead of
    // silently failing every poll tick. NOT authoritative — a DNS record can
    // change between now and the next poll, so the poller re-validates on
    // every fetch (and every redirect hop); that check is what actually
    // guards the network call.
    try {
      await assertSafeIcalUrl(url);
    } catch {
      throw new BadRequestError("ical_url must resolve to a public, non-reserved address");
    }

    const staff = await this.assertStaffAccess(actor, staffMemberId);

    const existing = await this.subscriptionRepo.findOne({
      where: { staff_member_id: staff.id },
    });
    if (existing) {
      const urlChanged = existing.ical_url !== url;
      existing.ical_url = url;
      existing.is_active = true;
      if (urlChanged) {
        existing.last_synced_at = null;
        existing.last_sync_error = null;
      }
      // Redacted on the way out too, so the route contract is uniform and no
      // future caller can come to rely on the raw URL being echoed here.
      return redact(await this.subscriptionRepo.save(existing));
    }

    return redact(
      await this.subscriptionRepo.save(
        this.subscriptionRepo.create({
          staff_member_id: staff.id,
          vendor_id: actor.vendorId,
          ical_url: url,
          is_active: true,
        }),
      ),
    );
  }

  // GET — REDACTED (review finding 8). `ical_url` is a bearer secret (see the
  // header); returning the entity unmodified handed a branch-A admin the
  // personal-calendar capability token a branch-B manager configured.
  async get(
    actor: CalendarSubscriptionActor,
    staffMemberId: string,
  ): Promise<RedactedCalendarSubscription | null> {
    const staff = await this.assertStaffAccess(actor, staffMemberId);
    const subscription = await this.subscriptionRepo.findOne({
      where: { staff_member_id: staff.id },
    });
    if (!subscription) return null;
    return redact(subscription);
  }

  // DELETE — soft-delete the subscription + release all engagements it imported
  // so its capacity frees immediately.
  async remove(actor: CalendarSubscriptionActor, staffMemberId: string): Promise<void> {
    const staff = await this.assertStaffAccess(actor, staffMemberId);
    const subscription = await this.subscriptionRepo.findOne({
      where: { staff_member_id: staff.id },
    });
    if (!subscription) throw new NotFoundError("Calendar subscription not found");

    const engagementService = new EngagementService(this.engagementRepo, this.cache);
    const engagements = await this.engagementRepo.find({
      where: {
        external_source: subscription.id,
        kind: EngagementKind.external_import,
        status: In([
          EngagementStatus.held,
          EngagementStatus.confirmed,
          EngagementStatus.conflicted,
        ]),
      },
    });
    for (const engagement of engagements) {
      await engagementService.release(engagement.id);
    }

    await this.subscriptionRepo.softRemove(subscription);
  }

  // Vendor-scoped staff load + location-manager check (owner/manager fast path;
  // otherwise a managing membership for one of the staff member's locations).
  private async assertStaffAccess(
    actor: CalendarSubscriptionActor,
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
        // 404 (not 403) — same "don't leak existence" contract as
        // block-time.service.ts's delete().
        throw new NotFoundError("Staff member not found");
      }
    }

    return staff;
  }
}
