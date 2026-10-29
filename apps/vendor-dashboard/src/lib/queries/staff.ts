import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { VendorLocation } from "./locations";
import type { ServiceOffering } from "./offerings";

// Staff CRUD + location/service linking live on booking-service, mounted at
// /vendor/booking/staff (see .superpowers/sdd/phase7-recon-api.md §3).
//
// Fix-cycle-1 finding I-3 — `GET /vendor/booking/staff/:id/locations` and
// `GET /vendor/booking/staff/:id/services` now exist (booking-service
// staff.routes.ts), closing the gap the original report disclosed (POST/DELETE
// only, no way to read persisted links). StaffLinksPanel reads real server
// state via useStaffLocationLinks/useStaffServiceLinks below instead of
// session-local tracking.

export interface StaffMember {
	id: string;
	vendor_id: string;
	user_id: string | null;
	name: string;
	avatar_url: string | null;
	bio: string | null;
	is_active: boolean;
	rating: string | number; // numeric column, may serialize as a string
	rating_count: number;
	created_at: string;
	updated_at: string;
}

export interface StaffMemberInput {
	name: string;
	user_id?: string | null;
	avatar_url?: string | null;
	bio?: string | null;
	is_active?: boolean;
}

export function useVendorStaff(options: { enabled?: boolean } = {}) {
	return useQuery<StaffMember[]>({
		queryKey: ["vendor", "booking-staff"],
		queryFn: async () => {
			const { data } = await api.get("/vendor/booking/staff");
			return data.data ?? [];
		},
		staleTime: 30_000,
		enabled: options.enabled ?? true,
	});
}

export function useVendorStaffMember(id: string) {
	return useQuery<StaffMember>({
		queryKey: ["vendor", "booking-staff", id],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/booking/staff/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

export function useCreateStaff() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: StaffMemberInput) => {
			const { data } = await api.post("/vendor/booking/staff", payload);
			return data.data as StaffMember;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-staff"] });
		},
	});
}

export function useUpdateStaff() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: { id: string; payload: Partial<StaffMemberInput> }) => {
			const { data } = await api.patch(`/vendor/booking/staff/${id}`, payload);
			return data.data as StaffMember;
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-staff"] });
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-staff", variables.id] });
		},
	});
}

// Fix-cycle-1 finding I-3 — persisted link reads. Response shape mirrors
// GET /vendor/booking/locations / GET /vendor/services respectively (the
// backend resolves the join-table ids to the full linked rows).

export function useStaffLocationLinks(staffId: string) {
	return useQuery<VendorLocation[]>({
		queryKey: ["vendor", "booking-staff", staffId, "locations"],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/booking/staff/${staffId}/locations`);
			return data.data ?? [];
		},
		enabled: !!staffId,
	});
}

export function useStaffServiceLinks(staffId: string) {
	return useQuery<ServiceOffering[]>({
		queryKey: ["vendor", "booking-staff", staffId, "services"],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/booking/staff/${staffId}/services`);
			return data.data ?? [];
		},
		enabled: !!staffId,
	});
}

export function useLinkStaffLocation(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (vendorLocationId: string) => {
			await api.post(`/vendor/booking/staff/${staffId}/locations`, {
				vendor_location_id: vendorLocationId,
			});
			return vendorLocationId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "locations"],
			});
		},
	});
}

export function useUnlinkStaffLocation(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (vendorLocationId: string) => {
			await api.delete(`/vendor/booking/staff/${staffId}/locations/${vendorLocationId}`);
			return vendorLocationId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "locations"],
			});
		},
	});
}

export function useLinkStaffService(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (serviceOfferingId: string) => {
			await api.post(`/vendor/booking/staff/${staffId}/services`, {
				service_offering_id: serviceOfferingId,
			});
			return serviceOfferingId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "services"],
			});
		},
	});
}

// Task 6 (calendar) — reverse "which staff work at this location" index.
// There is still no GET /vendor/booking/locations/:id/staff endpoint (only
// the per-staff .../staff/:id/locations read Task 5 fix-cycle-1 added), so
// this fans out one useStaffLocationLinks-shaped query PER staff (bounded —
// same "no pagination at current scale" convention as the rest of this
// surface) and shares its cache with useStaffLocationLinks via an identical
// query key, so visiting a staff detail page and the calendar never double-
// fetches the same staff's links.
export function useStaffLocationsIndex(staffIds: string[]) {
	return useQueries({
		queries: staffIds.map((staffId) => ({
			queryKey: ["vendor", "booking-staff", staffId, "locations"],
			queryFn: async () => {
				const { data } = await api.get(`/vendor/booking/staff/${staffId}/locations`);
				return (data.data ?? []) as VendorLocation[];
			},
			enabled: !!staffId,
		})),
	});
}

export function useUnlinkStaffService(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (serviceOfferingId: string) => {
			await api.delete(`/vendor/booking/staff/${staffId}/services/${serviceOfferingId}`);
			return serviceOfferingId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "services"],
			});
		},
	});
}
