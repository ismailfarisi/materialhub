import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** OpenDisputeBody categories (backend libs/dto order.dto.ts). */
export const DISPUTE_CATEGORIES = [
	"item_not_received",
	"not_as_described",
	"counterfeit",
	"seller_unresponsive",
	"other",
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export interface BuyerDispute {
	id: string;
	dispute_number: string;
	order_id: string;
	vendor_order_id: string | null;
	status: string;
	category: string;
	description: string;
	evidence_urls: string[];
	resolution: string | null;
	/** Fils. */
	resolution_amount: number | null;
	resolved_at: string | null;
	deadline_at: string | null;
	created_at: string;
}

export interface DisputeMessage {
	id: string;
	sender_role: string;
	message: string;
	is_internal: boolean;
	created_at: string;
}

const KEY = ["buyer", "disputes"] as const;

/** GET /buyer/disputes?order_id= — the signed-in buyer's disputes on one order. */
export function useOrderDisputes(orderId: string, enabled = true) {
	return useQuery({
		queryKey: [...KEY, "order", orderId],
		queryFn: async () => {
			const { data } = await api.get("/buyer/disputes", { params: { order_id: orderId, limit: 20 } });
			return (data.data ?? []) as BuyerDispute[];
		},
		enabled: enabled && !!orderId,
		retry: false,
	});
}

export function useBuyerDispute(id: string) {
	return useQuery({
		queryKey: [...KEY, "detail", id],
		queryFn: async () => {
			const { data } = await api.get(`/buyer/disputes/${id}`);
			return data.data as BuyerDispute;
		},
		enabled: !!id,
		retry: false,
	});
}

/** GET /disputes/:id/messages — the shared thread, without internal admin notes. */
export function useDisputeMessages(id: string) {
	return useQuery({
		queryKey: [...KEY, "messages", id],
		queryFn: async () => {
			const { data } = await api.get(`/disputes/${id}/messages`, { params: { limit: 100 } });
			return (data.data ?? []) as DisputeMessage[];
		},
		enabled: !!id,
		retry: false,
	});
}

export function usePostDisputeMessage(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (message: string) => {
			const { data } = await api.post(`/disputes/${id}/messages`, { message });
			return data.data as DisputeMessage;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [...KEY, "messages", id] });
		},
	});
}

/** POST /orders/:id/dispute — opens a case with MaterialHub against one supplier. */
export function useOpenDispute(orderId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: { category: DisputeCategory; description: string; vendor_order_id?: string }) => {
			const { data } = await api.post(`/orders/${orderId}/dispute`, payload);
			return data.data as BuyerDispute;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [...KEY, "order", orderId] });
			queryClient.invalidateQueries({ queryKey: ["order"] });
		},
	});
}
