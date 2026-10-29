import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveVendor } from "@/stores/active-vendor";
import { api } from "../api";

// Location-membership CRUD (Task 0B, Phase 7) — grants a vendor team member a
// per-location managing role, layered on top of their vendor-wide
// vendor_members grant (staff/viewer roles otherwise can't manage a branch
// at all). Lives on booking-service's /manage surface:
// GET/POST/DELETE /manage/locations/:id/members — see
// .superpowers/sdd/task-0b-report.md. Owner/manager (vendor-wide) ONLY may
// call these; the API 403s anyone else, so this hook set is only ever wired
// up behind that same gate on the frontend (useCanManageBookings — it
// already resolves to owner|manager, see hooks/use-vendor-role.ts).

// The only two literals `MANAGING_LOCATION_ROLES` (booking-service's
// location-scope.ts) recognizes as managing — granting any other value would
// be an inert row. Not the same vocabulary as a vendor_members role (which
// also has a "manager" literal, coincidentally) — this is a *location*-scoped
// role.
export type LocationMembershipRole = "manager" | "admin";

export interface LocationMembershipRow {
	id: string;
	vendor_location_id: string;
	user_id: string;
	role: string;
	permissions: string[];
	user_name: string | null;
	user_email: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateLocationMembershipInput {
	user_id: string;
	role: LocationMembershipRole;
}

export function useLocationMembers(locationId: string, options: { enabled?: boolean } = {}) {
	return useQuery<LocationMembershipRow[]>({
		queryKey: ["vendor", "booking-locations", locationId, "members"],
		queryFn: async () => {
			const { data } = await api.get(`/manage/locations/${locationId}/members`);
			return data.data ?? [];
		},
		enabled: (options.enabled ?? true) && !!locationId,
	});
}

export function useAddLocationMember(locationId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: CreateLocationMembershipInput) => {
			const { data } = await api.post(`/manage/locations/${locationId}/members`, input);
			return data.data as LocationMembershipRow;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-locations", locationId, "members"],
			});
		},
	});
}

export function useRemoveLocationMember(locationId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (membershipId: string) => {
			await api.delete(`/manage/locations/${locationId}/members/${membershipId}`);
			return membershipId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-locations", locationId, "members"],
			});
		},
	});
}

// GET /manage/my-location-memberships (Task 7 fix cycle, Important #2) — a
// SELF-scoped read, unlike useLocationMembers above: any authenticated vendor
// member may call it (the backend gates it the same
// vendorMembership("products.write") way as every other /manage route, but
// does NOT require owner|manager — see location-membership.service.ts's
// listMine). Returns just the caller's OWN active `{ location_id, role }`
// rows for the active vendor; an owner/manager caller always gets `[]` (they
// pass every location vendor-wide, so there's nothing to enumerate). This is
// what lets useCanManageAtLocation (hooks/use-vendor-role.ts) unlock
// location-scoped write affordances for a staff/viewer actor who holds a
// per-location managing grant, without them needing the owner/manager-only
// /manage/locations/:id/members route.
export interface MyLocationMembershipRow {
	location_id: string;
	role: string;
}

export function useMyLocationMemberships(options: { enabled?: boolean } = {}) {
	const activeVendorId = useActiveVendor((s) => s.activeVendorId);
	return useQuery<MyLocationMembershipRow[]>({
		queryKey: ["vendor", "booking-locations", "my-memberships", activeVendorId],
		queryFn: async () => {
			const { data } = await api.get("/manage/my-location-memberships");
			return data.data ?? [];
		},
		enabled: options.enabled ?? true,
	});
}
