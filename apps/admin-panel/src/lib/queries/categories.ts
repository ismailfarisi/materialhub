import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface CategoryTranslation {
	locale: string;
	name: string;
	description?: string | null;
}

export interface Category {
	id: string;
	name: string;
	slug: string;
	parent_id: string | null;
	sort_order: number;
	children?: Category[];
	child_count?: number;
	is_active?: boolean;
	is_featured?: boolean;
	description?: string | null;
	image_url?: string | null;
	icon_url?: string | null;
	banner_url?: string | null;
	commission_rate?: number | null;
	meta_title?: string | null;
	meta_description?: string | null;
	meta_keywords?: string | null;
	translations?: CategoryTranslation[];
}

export interface CategoryWritePayload {
	name?: string;
	slug?: string;
	parent_id?: string | null;
	description?: string | null;
	image_url?: string | null;
	icon_url?: string | null;
	banner_url?: string | null;
	is_active?: boolean;
	is_featured?: boolean;
	commission_rate?: number | null;
	meta_title?: string | null;
	meta_description?: string | null;
	meta_keywords?: string | null;
	translations?: CategoryTranslation[];
}

export function useCategoryTree() {
	return useQuery({
		queryKey: ["admin", "categories", "tree"],
		queryFn: async () => {
			const { data } = await api.get("/categories/tree");
			return data.data as Category[];
		},
	});
}

export function useAdminCategoryTree() {
	return useQuery({
		queryKey: ["admin", "categories", "admin-tree"],
		queryFn: async () => {
			const { data } = await api.get("/admin/categories/tree");
			return data.data as Category[];
		},
	});
}

export function useCreateCategory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (body: CategoryWritePayload & { name: string }) => {
			const { data } = await api.post("/admin/categories", body);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
		},
	});
}

export function useUpdateCategory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...body
		}: CategoryWritePayload & { id: string }) => {
			const { data } = await api.patch(`/admin/categories/${id}`, body);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
		},
	});
}

export function useToggleCategoryActive() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			is_active,
		}: { id: string; is_active: boolean }) => {
			const { data } = await api.patch(`/admin/categories/${id}`, {
				is_active,
			});
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
		},
	});
}

export function useDeleteCategory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/categories/${id}`);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
		},
	});
}

export function useReorderCategories() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (items: { id: string; sort_order: number }[]) => {
			const { data } = await api.patch("/admin/categories/reorder", { items });
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
		},
	});
}

export function useAssignAttributes() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			attribute_ids,
		}: { id: string; attribute_ids: string[] }) => {
			const { data } = await api.post(`/admin/categories/${id}/attributes`, {
				attribute_ids,
			});
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
		},
	});
}

export function useCategoryAttributes(id?: string) {
	return useQuery({
		queryKey: ["admin", "categories", id, "attributes"],
		queryFn: async () => {
			if (!id) return [];
			const { data } = await api.get(`/categories/by-id/${id}/attributes`);
			return data.data as { id: string }[];
		},
		enabled: !!id,
	});
}
