import type { LocationMembership, VendorLocation } from "@materialhub/database";
import { ForbiddenError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";

// The actor as resolved by the outer vendorMembership guard (member.vid/member.r)
// plus their user id.
export interface LocationActor {
  userId: string;
  vendorId: string;
  role: string;
}

// Vendor-wide roles that manage every branch of their own vendor.
const VENDOR_MANAGER_ROLES = new Set(["owner", "manager"]);
// Per-location roles that grant management of that one branch.
const MANAGING_LOCATION_ROLES = new Set(["manager", "admin"]);

export interface LocationScopeRepos {
  locationRepo: Repository<VendorLocation>;
  membershipRepo: Repository<LocationMembership>;
}

// Whether `role` is one of the vendor-wide roles that manage every branch of
// their own vendor unconditionally. Exposed so callers that need to skip a
// per-location lookup entirely for the common case (e.g.
// BlockTimeService.delete() avoiding a staff_locations query for the
// overwhelmingly common owner/manager actor) don't have to duplicate the role
// set inline.
export function isVendorManagerRole(role: string): boolean {
  return VENDOR_MANAGER_ROLES.has(role);
}

// Authorize a location-scoped mutation. Owner/vendor-manager of the active
// vendor pass for any of that vendor's branches; otherwise the actor must hold
// an active location_membership with a managing role for THIS branch. This is
// the enforcement seam every location-scoped write in Phases 2–6 goes through.
export async function assertLocationManager(
  actor: LocationActor,
  locationId: string,
  repos: LocationScopeRepos,
): Promise<{ vendorId: string }> {
  const location = await repos.locationRepo.findOne({ where: { id: locationId } });
  if (!location) throw new NotFoundError("Location not found");
  if (location.vendor_id !== actor.vendorId) {
    throw new ForbiddenError("Location does not belong to the active vendor");
  }
  if (VENDOR_MANAGER_ROLES.has(actor.role)) return { vendorId: location.vendor_id };

  const membership = await repos.membershipRepo.findOne({
    where: { vendor_location_id: locationId, user_id: actor.userId },
  });
  if (membership && MANAGING_LOCATION_ROLES.has(membership.role)) {
    return { vendorId: location.vendor_id };
  }
  throw new ForbiddenError("Not a manager of this location");
}

// Whether the actor manages EVERY one of the given candidate locations (in
// practice: every branch the target object could belong to — e.g. all the
// branches a staff member is linked to). Owner/vendor-manager of the active
// vendor always pass (identical fast path to assertLocationManager's own).
// Each candidate is checked via assertLocationManager; failures (wrong vendor,
// no managing membership, deleted location) are swallowed and collapse to
// `false`, since callers must not leak *why* access was denied.
//
// ── Why ALL and not ANY (review finding 7) ──────────────────────────────────
// This replaces an `isLocationManagerOfAny` that returned true if the actor
// managed ANY ONE of the candidates and never compared the TARGET to the
// actor's own branch. Because the candidate list is "every branch this staff
// member works at", a staff member shared between branches A and B made every
// object hanging off them reachable from EITHER branch: a single-branch admin
// at A could delete a block created at B, replace B's iCal subscription, and
// read a personal-calendar secret configured by B's manager.
//
// The objects these callers guard (staff_engagements rows, staff calendar
// subscriptions) carry no branch of their own in the schema, so the target's
// branch cannot be compared directly. ALL is the correct rule under that
// uncertainty: authorize only when every branch the target could belong to is
// one the actor already manages. A shared staff member therefore falls back to
// owner/vendor-manager, who always retain access — so no vendor is ever locked
// out of their own data, they just need the vendor-wide role for a resource
// that spans branches.
//
// An EMPTY candidate list returns false for a non-owner/manager: a target with
// no branch at all is not scoped to anyone's branch, so only the vendor-wide
// roles may touch it (same posture as the home-visit booking branch in
// manage-booking-actions.controller.ts).
export async function isLocationManagerOfAll(
  actor: LocationActor,
  locationIds: string[],
  repos: LocationScopeRepos,
): Promise<boolean> {
  if (VENDOR_MANAGER_ROLES.has(actor.role)) return true;
  if (locationIds.length === 0) return false;
  for (const locationId of locationIds) {
    try {
      await assertLocationManager(actor, locationId, repos);
    } catch {
      return false; // one unmanaged branch is enough to deny
    }
  }
  return true;
}

// The set of location ids the actor may act on for a vendor-wide (no single
// target location) read like BlockTimeService.list(). Returns `null` for
// owner/vendor-manager roles, meaning "unrestricted — every location of the
// active vendor" (their assertLocationManager fast path is location-count
// independent, so there's nothing to enumerate). For any other role, returns
// the (possibly empty) list of location ids the actor holds an active,
// managing location_membership for, filtered to locations that actually
// belong to the active vendor (defense in depth — location_memberships are
// per-location already, so this should always hold).
export async function getManagedLocationIds(
  actor: LocationActor,
  repos: LocationScopeRepos,
): Promise<string[] | null> {
  if (VENDOR_MANAGER_ROLES.has(actor.role)) return null;

  const memberships = await repos.membershipRepo.find({ where: { user_id: actor.userId } });
  const candidates = memberships.filter((m) => MANAGING_LOCATION_ROLES.has(m.role));
  if (candidates.length === 0) return [];

  const managed: string[] = [];
  for (const membership of candidates) {
    const location = await repos.locationRepo.findOne({
      where: { id: membership.vendor_location_id },
    });
    if (location && location.vendor_id === actor.vendorId) {
      managed.push(membership.vendor_location_id);
    }
  }
  return managed;
}
