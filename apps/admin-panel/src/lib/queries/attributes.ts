import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface AttributeFilters {
	search?: string;
	type?: string;
	page?: number;
	limit?: number;
}

export interface AttributeValue {
	id: string;
	attribute_id: string;
	value: string;
	display_value?: string;
	color_hex?: string | null;
	sort_order: number;
}

export type FilterInputType =
	| "checkbox"
	| "color_swatch"
	| "radio"
	| "range"
	| "toggle";

export interface Attribute {
	id: string;
	name: string;
	ar_label?: string | null;
	type: "text" | "number" | "color" | "select";
	is_variant: boolean;
	is_filterable: boolean;
	is_groupable?: boolean;
	filter_input_type: FilterInputType | null;
	value_count?: number;
	created_at: string;
}

export function useAttributes(filters: AttributeFilters = {}) {
	return useQuery({
		queryKey: ["admin", "attributes", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.search) params.search = filters.search;
			if (filters.type) params.type = filters.type;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/attributes", { params });
			return data.data as {
				data: Attribute[];
				total: number;
				page: number;
				limit: number;
			};
		},
	});
}

export function useCreateAttribute() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (body: {
			name: string;
			ar_label?: string | null;
			type: string;
			is_variant: boolean;
			is_filterable?: boolean;
			is_groupable?: boolean;
			filter_input_type?: FilterInputType | null;
		}) => {
			const { data } = await api.post("/admin/attributes", body);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "attributes"] });
		},
	});
}

export function useUpdateAttribute() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...body
		}: {
			id: string;
			name?: string;
			ar_label?: string | null;
			type?: string;
			is_variant?: boolean;
			is_filterable?: boolean;
			is_groupable?: boolean;
			filter_input_type?: FilterInputType | null;
		}) => {
			const { data } = await api.patch(`/admin/attributes/${id}`, body);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "attributes"] });
		},
	});
}

export function useDeleteAttribute() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/attributes/${id}`);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "attributes"] });
		},
	});
}

export function useAttributeValues(attrId: string) {
	return useQuery({
		queryKey: ["admin", "attributes", attrId, "values"],
		queryFn: async () => {
			const { data } = await api.get(`/admin/attributes/${attrId}/values`);
			return data.data as AttributeValue[];
		},
		enabled: !!attrId,
	});
}

export function useCreateAttributeValue() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			attrId,
			...body
		}: {
			attrId: string;
			value: string;
			display_value?: string;
			color_hex?: string | null;
		}) => {
			const { data } = await api.post(
				`/admin/attributes/${attrId}/values`,
				body,
			);
			return data.data;
		},
		onSuccess: (_data, { attrId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "attributes", attrId, "values"],
			});
			queryClient.invalidateQueries({ queryKey: ["admin", "attributes"] });
		},
	});
}

export function useUpdateAttributeValue() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			attrId,
			valueId,
			...body
		}: {
			attrId: string;
			valueId: string;
			value?: string;
			display_value?: string;
			color_hex?: string | null;
		}) => {
			const { data } = await api.patch(
				`/admin/attributes/${attrId}/values/${valueId}`,
				body,
			);
			return data.data;
		},
		onSuccess: (_data, { attrId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "attributes", attrId, "values"],
			});
		},
	});
}

export function useDeleteAttributeValue() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			attrId,
			valueId,
		}: { attrId: string; valueId: string }) => {
			const { data } = await api.delete(
				`/admin/attributes/${attrId}/values/${valueId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { attrId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "attributes", attrId, "values"],
			});
			queryClient.invalidateQueries({ queryKey: ["admin", "attributes"] });
		},
	});
}
