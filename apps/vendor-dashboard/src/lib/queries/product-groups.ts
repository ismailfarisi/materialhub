import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ProductGroupMemberInput {
	attribute_value_id: string;
	name: string;
	price: number; // fils
	compare_at_price?: number | null;
	sku?: string;
	is_primary?: boolean;
}

export interface CreateProductGroupPayload {
	name: string;
	grouping_attribute_id: string;
	listing_mode?: "collapsed" | "individual";
	shared: {
		category_id: string;
		brand_id?: string | null;
		short_description?: string;
		description?: string;
	};
	members: ProductGroupMemberInput[];
}

export function useCreateProductGroup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: CreateProductGroupPayload) => {
			const { data } = await api.post("/vendor/product-groups", payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "products"] });
		},
	});
}

export function useProductGroupByProduct(productId: string | undefined) {
	return useQuery({
		queryKey: ["vendor", "product-group", "by-product", productId],
		queryFn: async () => {
			const { data } = await api.get(
				`/vendor/product-groups/by-product/${productId}`,
			);
			return data.data; // group with members[], or null
		},
		enabled: !!productId,
	});
}

export function useUpdateProductGroup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: {
			id: string;
			payload: {
				name?: string;
				listing_mode?: "collapsed" | "individual";
				primary_member_id?: string;
			};
		}) => {
			const { data } = await api.patch(`/vendor/product-groups/${id}`, payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "product-group"] });
		},
	});
}

export function useRemoveGroupMember() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			groupId,
			memberId,
		}: {
			groupId: string;
			memberId: string;
		}) => {
			const { data } = await api.delete(
				`/vendor/product-groups/${groupId}/members/${memberId}`,
			);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "product-group"] });
		},
	});
}
