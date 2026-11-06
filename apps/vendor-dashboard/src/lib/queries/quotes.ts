import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// Mirrors order-service domain/quote (vendor views).

export type QuoteSupplierStatus =
	| "pending"
	| "responded"
	| "vendor_declined"
	| "buyer_declined"
	| "accepted"
	| "not_selected"
	| "cancelled";

export interface VendorQuoteResponse {
	id: string;
	status: "submitted" | "superseded" | "accepted" | "declined";
	display_state: "live" | "expired" | "accepted" | "declined" | "superseded";
	unit_price: number;
	moq: number;
	lead_time_days: number;
	valid_until: string;
	notes: string | null;
	order_quantity: number;
	total: number;
	product: {
		id: string;
		name: string;
		slug: string;
		price: number;
		image_url: string | null;
	} | null;
	variant: { id: string; name: string } | null;
	created_at: string;
}

export interface VendorQuoteRequestInfo {
	id: string;
	request_number: string;
	title: string;
	quantity: number;
	unit: string;
	need_by: string | null;
	delivery_emirate: string;
	status: "open" | "quoted" | "accepted" | "cancelled" | "closed";
	created_at: string;
	buyer: { display_name: string } | null;
}

export interface VendorQuoteRow {
	id: string;
	status: QuoteSupplierStatus;
	last_message_at: string | null;
	updated_at: string;
	request: VendorQuoteRequestInfo;
	current_response: VendorQuoteResponse | null;
}

export interface VendorQuoteMessage {
	id: string;
	sender_role: "buyer" | "vendor" | "system";
	body: string;
	attachments: { key: string; filename: string; content_type: string }[];
	created_at: string;
}

export interface VendorQuoteDetail {
	id: string;
	status: QuoteSupplierStatus;
	decline_reason: string | null;
	request: VendorQuoteRequestInfo & {
		specification: string;
		attachments: { key: string; filename: string; content_type: string }[];
		product: { id: string; name: string; slug: string; price: number } | null;
		variant: { id: string; name: string } | null;
		outcome: "won" | "lost" | null;
	};
	current_response_id: string | null;
	responses: VendorQuoteResponse[];
	messages: VendorQuoteMessage[];
	history: {
		id: string;
		subject: string;
		from_status: string | null;
		to_status: string;
		actor_role: string;
		note: string | null;
		created_at: string;
	}[];
	can_respond: boolean;
	can_decline: boolean;
	can_message: boolean;
}

export interface RespondPayload {
	product_id: string;
	variant_id?: string | null;
	unit_price: number;
	moq: number;
	lead_time_days: number;
	valid_until: string;
	notes?: string | null;
}

export function useVendorQuotes(filters: {
	status?: string;
	q?: string;
	page?: number;
	limit?: number;
}) {
	return useQuery({
		queryKey: ["vendor", "quotes", filters],
		queryFn: async () => {
			const { data } = await api.get("/vendor/quotes", { params: filters });
			return {
				items: (data.data ?? []) as VendorQuoteRow[],
				total: Number(data.total ?? 0),
				statusCounts: (data.status_counts ?? {}) as Record<string, number>,
			};
		},
	});
}

export function useVendorQuote(id: string) {
	return useQuery({
		queryKey: ["vendor", "quotes", "detail", id],
		enabled: !!id,
		queryFn: async () => {
			const { data } = await api.get(`/vendor/quotes/${id}`);
			return data.data as VendorQuoteDetail;
		},
	});
}

function useDetailMutation<T>(
	id: string,
	fn: (vars: T) => Promise<VendorQuoteDetail>,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: (detail) => {
			qc.setQueryData(["vendor", "quotes", "detail", id], detail);
			qc.invalidateQueries({ queryKey: ["vendor", "quotes"], exact: false });
		},
	});
}

export function useRespondToQuote(id: string) {
	return useDetailMutation(id, async (payload: RespondPayload) => {
		const { data } = await api.post(`/vendor/quotes/${id}/respond`, payload);
		return data.data as VendorQuoteDetail;
	});
}

export function useDeclineQuote(id: string) {
	return useDetailMutation(id, async (reason: string) => {
		const { data } = await api.post(`/vendor/quotes/${id}/decline`, {
			reason: reason || null,
		});
		return data.data as VendorQuoteDetail;
	});
}

export function useSendVendorQuoteMessage(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: string) => {
			const { data } = await api.post(`/vendor/quotes/${id}/messages`, {
				body,
			});
			return data.data as VendorQuoteMessage;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["vendor", "quotes", "detail", id] }),
	});
}

export async function openVendorQuoteAttachment(
	id: string,
	key: string,
): Promise<void> {
	const { data } = await api.get(`/vendor/quotes/${id}/attachment`, {
		params: { key },
	});
	window.open(
		(data.data as { url: string }).url,
		"_blank",
		"noopener,noreferrer",
	);
}
