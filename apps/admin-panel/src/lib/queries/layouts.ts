import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// ─── Section Types ─────────────────────────────────────────────────────────

export function useSectionTypes() {
	return useQuery({
		queryKey: ["admin", "layouts", "section-types"],
		queryFn: async () => {
			const { data } = await api.get("/admin/section-types");
			return data.data;
		},
	});
}

// ─── Layouts ───────────────────────────────────────────────────────────────

interface LayoutFilters {
	status?: string;
	vendor_id?: string;
	page?: number;
	limit?: number;
}

export function useLayouts(filters: LayoutFilters = {}) {
	return useQuery({
		queryKey: ["admin", "layouts", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.vendor_id) params.vendor_id = filters.vendor_id;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/layouts", { params });
			return data.data;
		},
	});
}

export function useLayout(id: string | undefined) {
	return useQuery({
		queryKey: ["admin", "layouts", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/layouts/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

export function useCreateLayout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			slug: string;
			title: Record<string, string>;
		}) => {
			const { data } = await api.post("/admin/layouts", payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "layouts"] });
		},
	});
}

export function useUpdateLayout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...payload
		}: { id: string; slug?: string; title?: Record<string, string> }) => {
			const { data } = await api.put(`/admin/layouts/${id}`, payload);
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "layouts"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "layouts", id] });
		},
	});
}

export function useDeleteLayout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/layouts/${id}`);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "layouts"] });
		},
	});
}

// ─── Versions ──────────────────────────────────────────────────────────────

export function useLayoutVersions(layoutId: string | undefined) {
	return useQuery({
		queryKey: ["admin", "layouts", layoutId, "versions"],
		queryFn: async () => {
			const { data } = await api.get(`/admin/layouts/${layoutId}/versions`);
			return data.data;
		},
		enabled: !!layoutId,
	});
}

export function usePublishLayout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (layoutId: string) => {
			const { data } = await api.post(`/admin/layouts/${layoutId}/publish`);
			return data.data;
		},
		onSuccess: (_data, layoutId) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
			queryClient.invalidateQueries({ queryKey: ["admin", "layouts"] });
		},
	});
}

export function useScheduleLayout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			layoutId,
			publish_at,
		}: { layoutId: string; publish_at: string }) => {
			const { data } = await api.post(`/admin/layouts/${layoutId}/schedule`, {
				publish_at,
			});
			return data.data;
		},
		onSuccess: (_data, { layoutId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
		},
	});
}

export function useRollbackLayout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			layoutId,
			versionId,
		}: { layoutId: string; versionId: string }) => {
			const { data } = await api.post(
				`/admin/layouts/${layoutId}/rollback/${versionId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { layoutId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
		},
	});
}

// ─── Sections ──────────────────────────────────────────────────────────────

export function useLayoutSections(layoutId: string | undefined) {
	return useQuery({
		queryKey: ["admin", "layouts", layoutId, "sections"],
		queryFn: async () => {
			const { data } = await api.get(`/admin/layouts/${layoutId}/sections`);
			return data.data;
		},
		enabled: !!layoutId,
	});
}

export function useAddSection() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			layoutId,
			...payload
		}: { layoutId: string; [key: string]: unknown }) => {
			const { data } = await api.post(
				`/admin/layouts/${layoutId}/sections`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { layoutId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
		},
	});
}

export function useUpdateSection() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			layoutId,
			sectionId,
			...payload
		}: { layoutId: string; sectionId: string; [key: string]: unknown }) => {
			const { data } = await api.put(
				`/admin/layouts/${layoutId}/sections/${sectionId}`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { layoutId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
		},
	});
}

export function useRemoveSection() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			layoutId,
			sectionId,
		}: { layoutId: string; sectionId: string }) => {
			const { data } = await api.delete(
				`/admin/layouts/${layoutId}/sections/${sectionId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { layoutId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
		},
	});
}

export function useReorderSections() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			layoutId,
			sections,
		}: { layoutId: string; sections: { id: string; position: number }[] }) => {
			const { data } = await api.put(
				`/admin/layouts/${layoutId}/sections/reorder`,
				{ sections },
			);
			return data.data;
		},
		onSuccess: (_data, { layoutId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "layouts", layoutId],
			});
		},
	});
}

// ─── Bids (Admin) ──────────────────────────────────────────────────────────

interface BidFilters {
	section_id?: string;
	vendor_id?: string;
	status?: string;
	page?: number;
	limit?: number;
}

export function useBids(filters: BidFilters = {}) {
	return useQuery({
		queryKey: ["admin", "bids", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.section_id) params.section_id = filters.section_id;
			if (filters.vendor_id) params.vendor_id = filters.vendor_id;
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/bids", { params });
			return data.data;
		},
	});
}

export function useApproveBid() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (bidId: string) => {
			const { data } = await api.post(`/admin/bids/${bidId}/approve`);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "bids"] });
		},
	});
}

export function useRejectBid() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (bidId: string) => {
			const { data } = await api.post(`/admin/bids/${bidId}/reject`);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "bids"] });
		},
	});
}

// ─── Bid Preview Token ──────────────────────────────────────────────────────

export function usePreviewBidToken() {
	return useMutation({
		mutationFn: async (bidId: string) => {
			const { data } = await api.post<{
				data: { token: string; layout_slug: string; expires_at: string };
			}>(`/admin/bids/${bidId}/preview-token`);
			return data.data;
		},
	});
}

// ─── Layout Draft Preview Token ─────────────────────────────────────────────

export function useLayoutPreviewToken() {
	return useMutation({
		mutationFn: async (layoutId: string) => {
			const { data } = await api.post<{
				data: { token: string; layout_slug: string; expires_at: string };
			}>(`/admin/layouts/${layoutId}/preview-token`);
			return data.data;
		},
	});
}

// ─── Enriched bid types (for the new admin bids page) ───────────────────────

export interface EnrichedBid {
	id: string;
	vendor_id: string;
	section_id: string;
	bid_amount_fils: number;
	status: string;
	starts_at?: string;
	expires_at?: string;
	created_at: string;
	product_id?: string | null;
	content?: Record<string, unknown> | null;
	vendor: {
		id: string;
		name: string;
		business_name: string;
		slug: string;
		logo_url: string | null;
	} | null;
	section: {
		id: string;
		position: number;
		type_name: string;
		type_label: Record<string, string>;
		layout_slug: string;
		layout_title: Record<string, string>;
		slots: number;
	} | null;
	outranked: {
		is_outranked: boolean;
		cutoff_bid_amount_fils?: number;
		cutoff_vendor_name?: string;
		slots: number;
	} | null;
}
