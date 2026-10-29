"use client";

import { getMembershipsFromToken, type VendorMembership } from "@/lib/auth";
import { useMyLocationMemberships } from "@/lib/queries/location-members";
import { useActiveVendor } from "@/stores/active-vendor";

// There is no granular permission-string gating client-side (per
// .superpowers/sdd/phase7-recon-frontend.md gotcha #4) — only the coarse
// owner|manager|staff|viewer role from the JWT `vm` claim is available. This
// mirrors the fallback-to-single-membership pattern already used in
// lib/queries/vendor-members.ts (useActiveVid). The backend remains the real
// enforcement point (vendorMembership("products.write") gates every booking
// vendor-management route) — this hook only drives UI affordances.
export function useActiveVendorRole(): VendorMembership["r"] | null {
	const activeVendorId = useActiveVendor((s) => s.activeVendorId);
	const memberships = typeof window !== "undefined" ? getMembershipsFromToken() : [];
	if (memberships.length === 1) return memberships[0].r;
	const found = memberships.find((m) => m.vid === activeVendorId);
	return found?.r ?? null;
}

// Write affordances (create/edit/publish/pause/archive) for the Bookings
// module are gated to owner|manager, matching the backend's
// vendorMembership("products.write") gate for /vendor/services and the rest
// of the booking vendor-management surface. staff|viewer get read-only UI.
export function useCanManageBookings(): boolean {
	const role = useActiveVendorRole();
	return role === "owner" || role === "manager";
}

// Task 7 fix cycle, Important #2 — the location-admin persona's write
// affordances. A caller can manage a location's day-to-day booking surface
// (calendar walk-ins/blocks/complete/no-show/reschedule, and — via the
// staff-detail page — the weekly-hours/time-off/calendar-sync tabs for a
// staff member linked to that location) if EITHER they're vendor-wide
// owner|manager (useCanManageBookings, unconditional pass) OR they hold an
// active per-location managing membership for that location
// (useMyLocationMemberships). Mirrors the backend's assertLocationManager /
// isLocationManagerOfAny exactly (guards/location-scope.ts in
// booking-service): same two-branch "vendor-wide role, else a matching
// location_membership" logic, same "ANY of several candidate locations
// unlocks" semantics when `locationIds` is an array (used by the staff-detail
// page for a staff member linked to multiple branches).
//
// Offerings/locations/policy screens are NOT gated by this hook — they stay
// owner|manager-only (useCanManageBookings alone), matching the spec's "no
// policy edits for location roles" constraint.
export function useCanManageAtLocation(
	locationIds: string | string[] | null | undefined,
): boolean {
	const canManageVendorWide = useCanManageBookings();
	// Skip the network round trip entirely once the vendor-wide check already
	// passes — the backend would return `[]` for an owner/manager anyway (see
	// LocationMembershipService.listMine), so there's nothing this query could
	// add.
	const { data: myMemberships = [] } = useMyLocationMemberships({
		enabled: !canManageVendorWide,
	});

	if (canManageVendorWide) return true;

	const ids = !locationIds ? [] : Array.isArray(locationIds) ? locationIds : [locationIds];
	if (ids.length === 0) return false;
	return myMemberships.some((m) => ids.includes(m.location_id));
}
