import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export interface AdminCollabFilters {
	status?: string;
	type?: string;
	vendorId?: string;
	page?: number;
	limit?: number;
}

export function useAdminCollabs(filters: AdminCollabFilters = {}) {
	return useQuery({
		queryKey: ["admin", "collabs", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__") params.status = filters.status;
			if (filters.type && filters.type !== "__all__") params.type = filters.type;
			if (filters.vendorId) params.vendorId = filters.vendorId;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/reels/collabs", { params });
			return data.data;
		},
	});
}

export function useAdminCollab(id: string) {
	return useQuery({
		queryKey: ["admin", "collabs", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/reels/collabs/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}
