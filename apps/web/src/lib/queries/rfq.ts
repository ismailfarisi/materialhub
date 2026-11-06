import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api";

/** Same keys lib/queries/cart.ts refreshes after any cart change. */
function invalidateCartDerived(qc: QueryClient) {
	qc.invalidateQueries({ queryKey: ["cart"] });
	qc.invalidateQueries({ queryKey: ["checkout", "quote"] });
	qc.invalidateQueries({ queryKey: ["checkout", "available-coupons"] });
}

// ── Types (mirror order-service domain/quote) ────────────────────────────

export const QUOTE_UNITS = [
	"sheet",
	"roll",
	"metre",
	"pack",
	"carton",
	"piece",
	"kg",
] as const;
export type QuoteUnit = (typeof QUOTE_UNITS)[number];
export const MAX_QUOTE_SUPPLIERS = 3;

export type QuoteRequestStatus =
	| "open"
	| "quoted"
	| "accepted"
	| "cancelled"
	| "closed";
export type QuoteSupplierStatus =
	| "pending"
	| "responded"
	| "vendor_declined"
	| "buyer_declined"
	| "accepted"
	| "not_selected"
	| "cancelled";
export type QuoteDisplayState =
	| "live"
	| "expired"
	| "accepted"
	| "declined"
	| "superseded";

export interface QuoteAttachment {
	key: string;
	filename: string;
	content_type: string;
}

export interface QuoteVendor {
	id: string;
	name: string;
	slug: string;
	logo_url: string | null;
}

export interface QuoteProduct {
	id: string;
	name: string;
	slug: string;
	price: number;
	image_url: string | null;
}

export interface QuoteResponse {
	id: string;
	status: string;
	display_state: QuoteDisplayState;
	unit_price: number;
	currency: string;
	moq: number;
	lead_time_days: number;
	valid_until: string;
	notes: string | null;
	order_quantity: number;
	total: number;
	product: QuoteProduct | null;
	variant: { id: string; name: string } | null;
	created_at: string;
}

export interface QuoteMessage {
	id: string;
	quote_request_vendor_id: string;
	sender_role: "buyer" | "vendor" | "system";
	body: string;
	attachments: QuoteAttachment[];
	created_at: string;
}

export interface QuoteSupplier {
	id: string;
	status: QuoteSupplierStatus;
	decline_reason: string | null;
	vendor: QuoteVendor | null;
	current_response: QuoteResponse | null;
	previous_responses: QuoteResponse[];
	messages: QuoteMessage[];
	can_accept: boolean;
	can_decline: boolean;
	can_message: boolean;
}

export interface QuoteHistoryEntry {
	id: string;
	quote_request_vendor_id: string | null;
	subject: "request" | "vendor" | "response";
	from_status: string | null;
	to_status: string;
	actor_role: string;
	note: string | null;
	created_at: string;
}

export interface QuoteRequestSummary {
	id: string;
	request_number: string;
	title: string;
	quantity: number;
	unit: QuoteUnit;
	need_by: string | null;
	delivery_emirate: string;
	status: QuoteRequestStatus;
	accepted_response_id: string | null;
	created_at: string;
}

export interface QuoteRequestListRow extends QuoteRequestSummary {
	suppliers: {
		id: string;
		status: QuoteSupplierStatus;
		vendor: QuoteVendor | null;
	}[];
	response_count: number;
	best_unit_price: number | null;
}

export interface QuoteRequestDetail extends QuoteRequestSummary {
	specification: string;
	attachments: QuoteAttachment[];
	product: QuoteProduct | null;
	variant: { id: string; name: string } | null;
	can_cancel: boolean;
	suppliers: QuoteSupplier[];
	history: QuoteHistoryEntry[];
}

export interface CreateQuoteRequestPayload {
	product_id?: string | null;
	variant_id?: string | null;
	category_id?: string | null;
	title?: string | null;
	specification: string;
	quantity: number;
	unit: QuoteUnit;
	need_by?: string | null;
	delivery_emirate: string;
	attachments?: QuoteAttachment[];
	vendor_ids?: string[];
	vendor_slugs?: string[];
}

// ── Queries ──────────────────────────────────────────────────────────────

export function useQuoteRequests(
	params: { status?: string; page?: number } = {},
) {
	return useQuery({
		queryKey: ["rfq", "list", params],
		queryFn: async () => {
			const { data } = await api.get("/buyer/quotes", {
				params: { ...params, status: params.status || undefined },
			});
			return {
				items: (data.data ?? []) as QuoteRequestListRow[],
				total: Number(data.total ?? 0),
			};
		},
	});
}

export function useQuoteRequest(id: string | undefined) {
	return useQuery({
		queryKey: ["rfq", "detail", id],
		enabled: !!id,
		queryFn: async () => {
			const { data } = await api.get(`/buyer/quotes/${id}`);
			return data.data as QuoteRequestDetail;
		},
	});
}

export function useCreateQuoteRequest() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: CreateQuoteRequestPayload) => {
			const { data } = await api.post("/buyer/quotes", payload);
			return data.data as QuoteRequestDetail;
		},
		onSuccess: (detail) => {
			qc.invalidateQueries({ queryKey: ["rfq", "list"] });
			qc.setQueryData(["rfq", "detail", detail.id], detail);
		},
	});
}

function useDetailMutation<TVars>(
	requestId: string,
	fn: (vars: TVars) => Promise<QuoteRequestDetail>,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: (detail) => {
			qc.setQueryData(["rfq", "detail", requestId], detail);
			qc.invalidateQueries({ queryKey: ["rfq", "list"] });
		},
	});
}

export function useAcceptQuote(requestId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (supplierId: string) => {
			const { data } = await api.post(
				`/buyer/quotes/${requestId}/suppliers/${supplierId}/accept`,
			);
			return data.data as {
				request: QuoteRequestDetail;
				cart_item: { quantity: number } | null;
			};
		},
		onSuccess: (res) => {
			qc.setQueryData(["rfq", "detail", requestId], res.request);
			qc.invalidateQueries({ queryKey: ["rfq", "list"] });
			invalidateCartDerived(qc);
		},
	});
}

export function useDeclineQuote(requestId: string) {
	return useDetailMutation(
		requestId,
		async (vars: { supplierId: string; reason?: string }) => {
			const { data } = await api.post(
				`/buyer/quotes/${requestId}/suppliers/${vars.supplierId}/decline`,
				{
					reason: vars.reason || null,
				},
			);
			return data.data as QuoteRequestDetail;
		},
	);
}

export function useCancelQuoteRequest(requestId: string) {
	return useDetailMutation(requestId, async (_: undefined) => {
		const { data } = await api.post(`/buyer/quotes/${requestId}/cancel`);
		return data.data as QuoteRequestDetail;
	});
}

export function useSendQuoteMessage(requestId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (vars: {
			supplierId: string;
			body: string;
			attachments?: QuoteAttachment[];
		}) => {
			const { data } = await api.post(
				`/buyer/quotes/${requestId}/suppliers/${vars.supplierId}/messages`,
				{
					body: vars.body,
					attachments: vars.attachments ?? [],
				},
			);
			return data.data as QuoteMessage;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["rfq", "detail", requestId] }),
	});
}

export async function openQuoteAttachment(
	requestId: string,
	key: string,
): Promise<void> {
	const { data } = await api.get(`/buyer/quotes/${requestId}/attachment`, {
		params: { key },
	});
	const url = (data.data as { url: string }).url;
	window.open(url, "_blank", "noopener,noreferrer");
}

// ── Attachments: presign → PUT to storage ────────────────────────────────

export const QUOTE_ATTACHMENT_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
];
export const QUOTE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export async function uploadQuoteAttachment(
	file: File,
): Promise<QuoteAttachment> {
	const { data } = await api.post("/media/presign", {
		asset_type: "quote_attachment",
		filename: file.name,
		content_type: file.type,
	});
	const presign = (data.data ?? data) as { uploadUrl: string; key: string };
	const res = await fetch(presign.uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": file.type },
		body: file,
	});
	if (!res.ok) throw new Error(`Upload failed (${res.status})`);
	return { key: presign.key, filename: file.name, content_type: file.type };
}

// ── Suppliers for the picker (category facets) ───────────────────────────

export interface SupplierOption {
	slug: string;
	name: string;
	count: number;
}

export function useCategorySuppliers(categorySlug: string | undefined) {
	return useQuery({
		queryKey: ["rfq", "suppliers", categorySlug],
		enabled: !!categorySlug,
		staleTime: 5 * 60_000,
		queryFn: async () => {
			const { data } = await api.get("/products", {
				params: { category: categorySlug, limit: 1 },
			});
			const vendors = (data?.data?.facets?.vendors ?? []) as {
				value: string;
				label: string;
				count: number;
			}[];
			return vendors.map((v) => ({
				slug: v.value,
				name: v.label,
				count: v.count,
			})) as SupplierOption[];
		},
	});
}
