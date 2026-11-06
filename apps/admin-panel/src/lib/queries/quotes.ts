import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

// Read-only RFQ views for support (order-service /admin/quotes).

export interface AdminQuoteVendor {
	id: string;
	name: string;
	slug: string;
	logo_url: string | null;
}

export interface AdminQuoteResponse {
	id: string;
	status: string;
	display_state: "live" | "expired" | "accepted" | "declined" | "superseded";
	unit_price: number;
	moq: number;
	lead_time_days: number;
	valid_until: string;
	notes: string | null;
	order_quantity: number;
	total: number;
	product: { id: string; name: string; slug: string } | null;
	variant: { id: string; name: string } | null;
	created_at: string;
}

export interface AdminQuoteSupplier {
	id: string;
	status: string;
	decline_reason: string | null;
	vendor: AdminQuoteVendor | null;
	current_response: AdminQuoteResponse | null;
	previous_responses: AdminQuoteResponse[];
	messages: {
		id: string;
		sender_role: string;
		body: string;
		created_at: string;
		attachments: { key: string; filename: string }[];
	}[];
}

export interface AdminQuoteBuyer {
	id: string;
	email: string;
	first_name: string | null;
	last_name: string | null;
}

export interface AdminQuoteRow {
	id: string;
	request_number: string;
	title: string;
	quantity: number;
	unit: string;
	need_by: string | null;
	delivery_emirate: string;
	status: string;
	created_at: string;
	buyer: AdminQuoteBuyer | null;
	suppliers: { id: string; status: string; vendor: AdminQuoteVendor | null }[];
}

export interface AdminQuoteDetail extends AdminQuoteRow {
	specification: string;
	attachments: { key: string; filename: string; content_type: string }[];
	product: { id: string; name: string; slug: string } | null;
	variant: { id: string; name: string } | null;
	accepted_response_id: string | null;
	accepted_at: string | null;
	cancelled_at: string | null;
	suppliers: AdminQuoteSupplier[];
	history: {
		id: string;
		quote_request_vendor_id: string | null;
		subject: string;
		from_status: string | null;
		to_status: string;
		actor_role: string;
		note: string | null;
		created_at: string;
	}[];
}

export function useAdminQuotes(filters: {
	status?: string;
	q?: string;
	page?: number;
	limit?: number;
}) {
	return useQuery({
		queryKey: ["admin", "quotes", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.q) params.q = filters.q;
			if (filters.page) params.page = filters.page;
			if (filters.limit) params.limit = filters.limit;
			const { data } = await api.get("/admin/quotes", { params });
			return {
				items: (data.data ?? []) as AdminQuoteRow[],
				total: Number(data.total ?? 0),
			};
		},
	});
}

export function useAdminQuote(id: string) {
	return useQuery({
		queryKey: ["admin", "quotes", "detail", id],
		enabled: !!id,
		queryFn: async () => {
			const { data } = await api.get(`/admin/quotes/${id}`);
			return data.data as AdminQuoteDetail;
		},
	});
}

export async function openAdminQuoteAttachment(
	id: string,
	key: string,
): Promise<void> {
	const { data } = await api.get(`/admin/quotes/${id}/attachment`, {
		params: { key },
	});
	window.open(
		(data.data as { url: string }).url,
		"_blank",
		"noopener,noreferrer",
	);
}
