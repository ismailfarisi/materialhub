import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { type PaymentTerms, unwrapList } from "../business.helpers";

// Types mirror docs/business/business-accounts.md ("Receivables").

export type ReceivableTab = "due" | "overdue" | "paid" | "all";

export interface ReceivableInvoice {
	id: string;
	invoice_number: string;
	seller_name: string;
	total_fils: number;
}

export interface Receivable {
	order_id: string;
	order_number: string;
	business_account_id: string;
	legal_name: string;
	trn: string | null;
	terms: PaymentTerms;
	amount_fils: number;
	confirmed_at: string;
	due_at: string;
	status: "due" | "overdue" | "paid";
	days_overdue: number;
	paid_at: string | null;
	payment_reference: string | null;
	invoices: ReceivableInvoice[];
}

export interface ReceivablesSummary {
	due_count: number;
	due_fils: number;
	overdue_count: number;
	overdue_fils: number;
	paid_count: number;
	paid_fils: number;
}

const root = ["admin", "receivables"] as const;

export function useReceivables(filters: {
	status: ReceivableTab;
	q?: string;
	page?: number;
	limit?: number;
}) {
	return useQuery({
		queryKey: [...root, "list", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {
				status: filters.status,
			};
			if (filters.q) params.q = filters.q;
			if (filters.page) params.page = filters.page;
			if (filters.limit) params.limit = filters.limit;
			const { data } = await api.get("/admin/receivables", { params });
			return unwrapList<Receivable, ReceivablesSummary>(data);
		},
	});
}

export function useMarkReceivablePaid() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			orderId: string;
			reference: string;
			paid_at?: string;
		}) => {
			const { data } = await api.post(
				`/admin/receivables/${input.orderId}/mark-paid`,
				{ reference: input.reference, paid_at: input.paid_at },
			);
			return data.data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [...root] });
			// Marking paid frees the business's credit.
			qc.invalidateQueries({ queryKey: ["admin", "business-accounts"] });
		},
	});
}

/**
 * The XML endpoint answers with the file itself (application/xml, attachment),
 * not the JSON envelope. Fetched through axios so the bearer token is sent.
 */
export function useDownloadInvoiceXml() {
	return useMutation({
		mutationFn: async (invoice: { id: string; invoice_number: string }) => {
			const response = await api.get<Blob>(
				`/admin/receivables/invoices/${invoice.id}/xml`,
				{ responseType: "blob" },
			);
			const blobUrl = URL.createObjectURL(response.data);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = `${invoice.invoice_number}.xml`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(blobUrl);
		},
	});
}

export function useOpenInvoicePdf() {
	return useMutation({
		mutationFn: async (invoiceId: string) => {
			// A signed storage URL in the JSON envelope, or the PDF itself when
			// the API has no object storage (then opened from a blob URL).
			const { data } = await api.get<Blob>(
				`/admin/receivables/invoices/${invoiceId}/pdf`,
				{ responseType: "blob" },
			);
			if (data.type === "application/pdf") {
				return { url: URL.createObjectURL(data) };
			}
			const json = JSON.parse(await data.text());
			return json.data as { url: string };
		},
	});
}
