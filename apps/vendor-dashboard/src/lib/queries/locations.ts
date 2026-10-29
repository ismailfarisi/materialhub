import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// Vendor locations + service-areas (home-visit coverage) live on booking-service,
// mounted at /vendor/booking (see .superpowers/sdd/phase7-recon-api.md §3). No
// pagination on either list — small counts at current scale, matches the
// offerings/staff convention (recon gotcha #14).

export interface VendorLocationAddress {
	street?: string;
	area?: string;
	city?: string;
	emirate?: string;
}

export interface VendorLocation {
	id: string;
	vendor_id: string;
	name: string;
	address: VendorLocationAddress | null;
	lat: number | null;
	lng: number | null;
	area_id: string | null;
	timezone: string;
	is_active: boolean;
	settings: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

// Body accepted by POST /vendor/booking/locations and (partially, via
// Partial<>) PATCH .../:id. Only `name` is required. `settings` is
// deliberately not exposed by this UI (task-5-brief.md: out of scope).
export interface VendorLocationInput {
	name: string;
	address?: VendorLocationAddress | null;
	lat?: number | null;
	lng?: number | null;
	area_id?: string | null;
	timezone?: string;
	is_active?: boolean;
}

export function useVendorLocations(options: { enabled?: boolean } = {}) {
	return useQuery<VendorLocation[]>({
		queryKey: ["vendor", "booking-locations"],
		queryFn: async () => {
			const { data } = await api.get("/vendor/booking/locations");
			return data.data ?? [];
		},
		staleTime: 30_000,
		enabled: options.enabled ?? true,
	});
}

export function useVendorLocation(id: string) {
	return useQuery<VendorLocation>({
		queryKey: ["vendor", "booking-locations", id],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/booking/locations/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

export function useCreateLocation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: VendorLocationInput) => {
			const { data } = await api.post("/vendor/booking/locations", payload);
			return data.data as VendorLocation;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-locations"] });
		},
	});
}

export function useUpdateLocation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: { id: string; payload: Partial<VendorLocationInput> }) => {
			const { data } = await api.patch(`/vendor/booking/locations/${id}`, payload);
			return data.data as VendorLocation;
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-locations"] });
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-locations", variables.id],
			});
		},
	});
}

// ─── Service areas (vendor-wide home-visit coverage — NOT location-scoped;
// the service_areas table has no location_id column) ───────────────────

export interface ServiceArea {
	id: string;
	vendor_id: string;
	area_id: string;
	travel_buffer_minutes: number;
	created_at: string;
	updated_at: string;
}

export interface ServiceAreaInput {
	area_id: string;
	travel_buffer_minutes?: number;
}

export function useServiceAreas(options: { enabled?: boolean } = {}) {
	return useQuery<ServiceArea[]>({
		queryKey: ["vendor", "booking-service-areas"],
		queryFn: async () => {
			const { data } = await api.get("/vendor/booking/service-areas");
			return data.data ?? [];
		},
		staleTime: 30_000,
		enabled: options.enabled ?? true,
	});
}

export function useCreateServiceArea() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: ServiceAreaInput) => {
			const { data } = await api.post("/vendor/booking/service-areas", payload);
			return data.data as ServiceArea;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-service-areas"] });
		},
	});
}

export function useDeleteServiceArea() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/vendor/booking/service-areas/${id}`);
			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "booking-service-areas"] });
		},
	});
}

// ─── Delivery zones (area picker source — public order-service endpoint,
// same one apps/web's lib/queries/areas.ts consumes) ─────────────────────

export interface DeliveryZone {
	id: string;
	name: string;
	slug: string;
	city: string;
	emirate: string;
	country_code: string;
	is_active: boolean;
	sort_order: number;
}

export function useDeliveryZones() {
	return useQuery<DeliveryZone[]>({
		queryKey: ["shipping", "delivery-zones"],
		queryFn: async () => {
			const { data } = await api.get("/shipping/delivery-zones");
			return data.data ?? [];
		},
		staleTime: 10 * 60_000,
	});
}
