import type {
	TermsPayload,
	TermsView,
} from "@/components/products/trade/trade-pricing.helpers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface TradePricing {
	product_id: string;
	has_variants: boolean;
	product: TermsView;
	variants: TermsView[];
	sample: {
		variant_id: string;
		enabled: boolean;
		price: number;
		max_quantity: number | null;
		sku: string | null;
	} | null;
}

const key = (id: string) =>
	["vendor", "products", id, "trade-pricing"] as const;

export function useTradePricing(productId: string) {
	return useQuery({
		queryKey: key(productId),
		queryFn: async () => {
			const { data } = await api.get(`/products/${productId}/trade-pricing`);
			return data.data as TradePricing;
		},
		enabled: !!productId,
	});
}

export function useSaveTradeTerms(productId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: TermsPayload) => {
			const { data } = await api.put(
				`/products/${productId}/trade-pricing`,
				payload,
			);
			return data.data as TradePricing;
		},
		onSuccess: (data) => {
			qc.setQueryData(key(productId), data);
			qc.invalidateQueries({ queryKey: ["vendor", "products", productId] });
		},
	});
}

export function useSaveSample(productId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			enabled: boolean;
			price?: number;
			max_quantity?: number | null;
			sku?: string | null;
			quantity_on_hand?: number;
		}) => {
			const { data } = await api.put(`/products/${productId}/sample`, payload);
			return data.data as TradePricing;
		},
		onSuccess: (data) => {
			qc.setQueryData(key(productId), data);
			qc.invalidateQueries({ queryKey: ["vendor", "products", productId] });
		},
	});
}
