import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface AdminOfferingFilters {
	status?: string;
	vendorId?: string;
	search?: string;
	page?: number;
	limit?: number;
}

export function useAdminOfferings(filters: AdminOfferingFilters = {}) {
	return useQuery({
		queryKey: ["admin", "service-offerings", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__") params.status = filters.status;
			if (filters.vendorId) params.vendorId = filters.vendorId;
			if (filters.search) params.search = filters.search;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/service-offerings", { params });
			return data.data;
		},
	});
}

export function useAdminOffering(id: string) {
	return useQuery({
		queryKey: ["admin", "service-offerings", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/service-offerings/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id: string) {
	queryClient.invalidateQueries({ queryKey: ["admin", "service-offerings"] });
	queryClient.invalidateQueries({ queryKey: ["admin", "service-offerings", id] });
}

/**
 * Approving publishes this offering AND sets vendors.services_trusted, so every
 * future offering from the same vendor publishes without review. The calling
 * component must say so in its confirmation copy.
 */
export function useApproveOffering() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/service-offerings/${id}/approve`);
			return data.data;
		},
		onSuccess: (_data, id) => invalidate(queryClient, id),
	});
}

export function useRejectOffering() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.post(`/admin/service-offerings/${id}/reject`, { reason });
			return data.data;
		},
		onSuccess: (_data, { id }) => invalidate(queryClient, id),
	});
}
