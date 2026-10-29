import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ProductFilters {
	search?: string;
	status?: string;
	page?: number;
	limit?: number;
}

export function useVendorProducts(filters: ProductFilters = {}) {
	return useQuery({
		queryKey: ["vendor", "products", filters],
		queryFn: async () => {
			const { data } = await api.get("/products/mine", { params: filters });
			return data.data;
		},
	});
}

export function useVendorProduct(id: string) {
	return useQuery({
		queryKey: ["vendor", "products", id],
		queryFn: async () => {
			const { data } = await api.get(`/products/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

export function useCreateProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: Record<string, unknown>) => {
			const { data } = await api.post("/products", payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
		},
	});
}

export function useUpdateProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: { id: string; payload: Record<string, unknown> }) => {
			const { data } = await api.patch(`/products/${id}`, payload);
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
			queryClient.invalidateQueries({ queryKey: ["vendor", "products", id] });
		},
	});
}

export function useDeleteProduct() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/products/${id}`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
		},
	});
}

export function useRestockInventory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			product_id: string;
			variant_id?: string;
			warehouse_id?: string;
			quantity: number;
		}) => {
			const { data } = await api.post("/inventory/restock", payload);
			return data.data;
		},
		onSuccess: (_data, { product_id }) => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
			queryClient.invalidateQueries({ queryKey: ["vendor", "products", product_id] });
		},
	});
}

export function useAdjustInventory() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			product_id: string;
			variant_id?: string;
			warehouse_id?: string;
			quantity: number;
			reason: string;
		}) => {
			const { data } = await api.post("/inventory/adjust", payload);
			return data.data;
		},
		onSuccess: (_data, { product_id }) => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
			queryClient.invalidateQueries({ queryKey: ["vendor", "products", product_id] });
		},
	});
}

export function useBulkAction() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ ids, action }: { ids: string[]; action: string }) => {
			const { data } = await api.post("/products/bulk-action", { ids, action });
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
		},
	});
}

// ─── Image Management ─────────────────────────────────────────────────────────

export function useAddProductImage() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			payload,
		}: {
			productId: string;
			payload: { url: string; alt_text?: string; is_primary?: boolean };
		}) => {
			const { data } = await api.post(`/products/${productId}/images`, payload);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
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
		}: {
			productId: string;
			imageId: string;
		}) => {
			await api.delete(`/products/${productId}/images/${imageId}`);
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
			});
		},
	});
}

// ─── Variant Management ──────────────────────────────────────────────────────

export function useGenerateVariants() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			productId,
			options,
			variants,
		}: {
			productId: string;
			options?: Array<{ attribute_id: string; values: string[] }>;
			variants?: Array<{
				option_values: Record<string, string>;
				name?: string;
				price: number;
				sku?: string;
				quantity_on_hand?: number;
			}>;
		}) => {
			const { data } = await api.post(
				`/products/${productId}/variants`,
				variants ? { variants } : { options },
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
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
			payload,
		}: {
			productId: string;
			variantId: string;
			payload: Record<string, unknown>;
		}) => {
			const { data } = await api.patch(
				`/products/${productId}/variants/${variantId}`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
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
		}: {
			productId: string;
			variantId: string;
		}) => {
			await api.delete(`/products/${productId}/variants/${variantId}`);
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
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
			await api.patch(`/products/${productId}/images/reorder`, { items });
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
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
		}: {
			productId: string;
			key: string;
			altText?: string;
			isPrimary?: boolean;
		}) => {
			const { data } = await api.post("/media/process", {
				key,
				product_id: productId,
				alt_text: altText,
				is_primary: isPrimary ?? false,
			});
			return data;
		},
		onSuccess: (_data, { productId }) => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "products", productId],
			});
		},
	});
}
