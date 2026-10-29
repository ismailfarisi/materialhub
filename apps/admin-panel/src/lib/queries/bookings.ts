import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface AdminBookingFilters {
	status?: string;
	vendorId?: string;
	staffMemberId?: string;
	locationId?: string;
	from?: string;
	to?: string;
	search?: string;
	page?: number;
	limit?: number;
}

export function useAdminBookings(filters: AdminBookingFilters = {}) {
	return useQuery({
		queryKey: ["admin", "bookings", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__") params.status = filters.status;
			if (filters.vendorId) params.vendorId = filters.vendorId;
			if (filters.staffMemberId) params.staffMemberId = filters.staffMemberId;
			if (filters.locationId) params.locationId = filters.locationId;
			if (filters.from) params.from = filters.from;
			if (filters.to) params.to = filters.to;
			if (filters.search) params.search = filters.search;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/bookings", { params });
			return data.data;
		},
	});
}

export function useAdminBooking(id: string) {
	return useQuery({
		queryKey: ["admin", "bookings", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/bookings/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
	queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
	queryClient.invalidateQueries({ queryKey: ["admin", "bookings", id] });
}

/**
 * Completing a booking captures the customer's payment and accrues vendor
 * commission — it is not a display-only status flip. The calling component must
 * confirm before firing this.
 */
export function useCompleteBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
			const { data } = await api.post(`/admin/bookings/${id}/complete`, { reason });
			return data.data;
		},
		onSuccess: (_data, { id }) => invalidate(queryClient, id),
	});
}

// Cancel and no-show reuse the pre-existing customer-and-admin endpoints
// (booking.routes.ts, manage-booking.routes.ts). They already accept an admin
// caller and bypass the customer-only policy windows.
//
// Reschedule is NOT implemented here — it was deferred out of this slice (no
// hook, no button, no "reschedule" BookingActionKey). Do not assume it reuses
// the same endpoint pattern until it's actually built.
export function useCancelBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.post(`/bookings/${id}/cancel`, { reason });
			return data.data;
		},
		onSuccess: (_data, { id }) => invalidate(queryClient, id),
	});
}

export function useNoShowBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
			const { data } = await api.post(`/bookings/${id}/no-show`, { reason });
			return data.data;
		},
		onSuccess: (_data, { id }) => invalidate(queryClient, id),
	});
}
