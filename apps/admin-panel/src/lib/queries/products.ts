import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface ProductFilters {
	page?: number;
	limit?: number;
	status?: string;
	vendor_id?: string;
	category_id?: string;
	brand_id?: string;
	search?: string;
}

export function useAdminProducts(filters: ProductFilters = {}) {
	return useQuery({
		queryKey: ["admin", "products", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.vendor_id && filters.vendor_id !== "__all__")
				params.vendor_id = filters.vendor_id;
			if (filters.category_id && filters.category_id !== "__all__")
				params.category_id = filters.category_id;
			if (filters.brand_id && filters.brand_id !== "__all__")
				params.brand_id = filters.brand_id;
			if (filters.search) params.search = filters.search;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/products", { params });
			return data.data;
		},
	});
}

export function useAdminProduct(id: string) {
	return useQuery({
		queryKey: ["admin", "products", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/products/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

// useCreateAdminProduct and useUpdateAdminProduct already accept flexible payloads,
// so new fields (ingredients, usage_instructions, editorial) are passed through without
// any type widening required.
export type AdminProductPayload = Record<string, unknown>;

export function useCreateAdminProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: AdminProductPayload) => {
			const { data } = await api.post("/admin/products", payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
		},
	});
}

export function useUpdateAdminProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...payload
		}: { id: string } & AdminProductPayload) => {
			const { data } = await api.patch(`/admin/products/${id}`, payload);
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "products", id] });
		},
	});
}

export function useDeleteAdminProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/products/${id}`);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
		},
	});
}

export function useApproveProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/products/${id}/approve`);
			return data.data;
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "products", id] });
		},
	});
}

export function useRejectProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.post(`/admin/products/${id}/reject`, {
				reason,
			});
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "products", id] });
		},
	});
}

export function usePublishProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/products/${id}/publish`);
			return data.data;
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "products", id] });
		},
	});
}

export function useUnpublishProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/products/${id}/unpublish`);
			return data.data;
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "products", id] });
		},
	});
}

export function useToggleFeatureProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/products/${id}/feature`);
			return data.data;
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "products", id] });
		},
	});
}

export function useBulkProductAction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			action: string;
			ids: string[];
			reason?: string;
		}) => {
			const { data } = await api.post("/admin/products/bulk-action", payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
		},
	});
}

export function useAddProductImage() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			...payload
		}: { productId: string } & AdminProductPayload) => {
			const { data } = await api.post(
				`/admin/products/${productId}/images`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useReorderProductImages() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			items,
		}: {
			productId: string;
			items: Array<{ id: string; sort_order: number }>;
		}) => {
			const { data } = await api.patch(
				`/admin/products/${productId}/images/reorder`,
				{ items },
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useDeleteProductImage() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			imageId,
		}: { productId: string; imageId: string }) => {
			const { data } = await api.delete(
				`/admin/products/${productId}/images/${imageId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useGenerateVariants() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			options,
		}: { productId: string; options: Array<Record<string, unknown>> }) => {
			const { data } = await api.post(`/admin/products/${productId}/variants`, {
				options,
			});
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useUpdateVariant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			variantId,
			...payload
		}: { productId: string; variantId: string } & AdminProductPayload) => {
			const { data } = await api.patch(
				`/admin/products/${productId}/variants/${variantId}`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useDeleteVariant() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			variantId,
		}: { productId: string; variantId: string }) => {
			const { data } = await api.delete(
				`/admin/products/${productId}/variants/${variantId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useRestockInventory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			...payload
		}: {
			productId: string;
			variant_id?: string;
			warehouse_id?: string;
			quantity: number;
		}) => {
			const { data } = await api.post(
				`/admin/products/${productId}/inventory/restock`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useAdjustInventory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			...payload
		}: {
			productId: string;
			variant_id?: string;
			warehouse_id?: string;
			quantity: number;
			reason: string;
		}) => {
			const { data } = await api.post(
				`/admin/products/${productId}/inventory/adjust`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export function useProcessProductImage() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			key,
			altText,
			isPrimary,
			variantId,
		}: {
			productId: string;
			key: string;
			altText?: string;
			isPrimary?: boolean;
			variantId?: string;
		}) => {
			const { data } = await api.post("/media/process", {
				key,
				product_id: productId,
				alt_text: altText,
				is_primary: isPrimary ?? false,
				variant_id: variantId ?? null,
			});
			return data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "products", productId],
			});
		},
	});
}

export interface ProductAiEnhanceDraft {
	product: {
		name?: string;
		description?: string;
		ingredients?: string;
		usage_instructions?: string;
		meta_title?: string;
		meta_description?: string;
		tags?: string[];
	};
	translations: Array<{
		locale: "ar";
		name: string;
		description?: string | null;
		ingredients?: string | null;
		usage_instructions?: string | null;
		meta_title?: string | null;
		meta_description?: string | null;
	}>;
	attributes: Array<{
		attribute_id: string;
		value_id?: string | null;
		value_ids?: string[] | null;
		value?: string | null;
		values?: string[] | null;
		display_value?: string | null;
		text_value?: string | null;
	}>;
	warnings?: string[];
}

export function productAiDraftEndpoint(productId: string) {
	return `/admin/products/${productId}/ai-enhance-content`;
}

function isProductAiDraft(value: unknown): value is ProductAiEnhanceDraft {
	if (!value || typeof value !== "object") return false;
	const draft = value as Partial<ProductAiEnhanceDraft>;
	return (
		Boolean(draft.product && typeof draft.product === "object") &&
		Array.isArray(draft.translations) &&
		Array.isArray(draft.attributes)
	);
}

export function extractProductAiDraftResponse(
	payload: unknown,
): ProductAiEnhanceDraft {
	let current = payload;
	for (let depth = 0; depth < 3; depth += 1) {
		if (isProductAiDraft(current)) return current;
		if (!current || typeof current !== "object" || !("data" in current)) break;
		current = (current as { data?: unknown }).data;
	}
	throw new Error("Product AI response did not include a draft");
}

export function useGenerateProductAiDraft() {
	return useMutation({
		mutationFn: async (productId: string) => {
			const { data } = await api.post(productAiDraftEndpoint(productId));
			return extractProductAiDraftResponse(data);
		},
	});
}
