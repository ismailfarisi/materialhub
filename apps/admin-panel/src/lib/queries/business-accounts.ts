import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { type PaymentTerms, unwrapList } from "../business.helpers";

// Types mirror docs/business/business-accounts.md ("Admin API").

export type VerificationStatus = "pending" | "verified" | "rejected";
export type NetTermsStatus = "applied" | "approved" | "rejected" | "suspended";

export interface BillingAddress {
	line1: string;
	line2?: string | null;
	city: string;
	emirate: string;
	po_box?: string | null;
	country_code: "AE";
}

export interface CreditAccount {
	status: NetTermsStatus;
	terms: PaymentTerms;
	requested_limit_fils: number | null;
	credit_limit_fils: number;
	outstanding_fils: number;
	available_fils: number;
	overdue_count: number;
	overdue_fils: number;
	applied_at: string;
	decided_at: string | null;
	decision_note: string | null;
}

export interface BusinessMember {
	id: string;
	user_id: string | null;
	email: string;
	name: string | null;
	role: "admin" | "approver" | "buyer";
	status: "invited" | "active";
	invited_at: string;
	joined_at: string | null;
}

export interface AdminBusinessRow {
	id: string;
	legal_name: string;
	trade_name?: string | null;
	trade_licence_number: string;
	trade_licence_issuer?: string | null;
	trade_licence_expiry: string;
	vat_registered: boolean;
	trn?: string | null;
	billing_address: BillingAddress;
	has_licence_document: boolean;
	peppol_participant_id: string | null;
	verification_status: VerificationStatus;
	rejection_reason: string | null;
	verified_at: string | null;
	approval_threshold_fils: number | null;
	created_at: string;
	trn_format_valid: boolean;
	licence_expired: boolean;
	member_count: number;
	owner: { id: string; email: string; name: string | null } | null;
	credit: CreditAccount | null;
}

export interface AdminBusinessDetail extends AdminBusinessRow {
	members: BusinessMember[];
}

export interface BusinessAccountFilters {
	status?: VerificationStatus;
	net_terms?: NetTermsStatus;
	q?: string;
	page?: number;
	limit?: number;
}

const root = ["admin", "business-accounts"] as const;

export function useBusinessAccounts(filters: BusinessAccountFilters = {}) {
	return useQuery({
		queryKey: [...root, "list", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			for (const [k, v] of Object.entries(filters)) {
				if (v !== undefined && v !== "") params[k] = v;
			}
			const { data } = await api.get("/admin/business-accounts", { params });
			return unwrapList<AdminBusinessRow>(data);
		},
	});
}

export function useBusinessAccount(id: string) {
	return useQuery({
		queryKey: [...root, "detail", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/business-accounts/${id}`);
			return data.data as AdminBusinessDetail;
		},
		enabled: !!id,
	});
}

/** Signed for 5 minutes, so fetch on click rather than caching it. */
export function useOpenBusinessLicence() {
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.get(`/admin/business-accounts/${id}/licence`);
			return data.data as { url: string };
		},
	});
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({ queryKey: [...root] });
}

export function useDecideVerification() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			id: string;
			decision: "verified" | "rejected";
			reason?: string;
		}) => {
			const { data } = await api.post(
				`/admin/business-accounts/${input.id}/verification`,
				{ decision: input.decision, reason: input.reason },
			);
			return data.data as AdminBusinessRow;
		},
		onSuccess: () => invalidate(qc),
	});
}

export function useDecideNetTerms() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			id: string;
			decision: "approved" | "rejected" | "suspended";
			terms?: PaymentTerms;
			credit_limit_fils?: number;
			note?: string;
		}) => {
			const { id, ...body } = input;
			const { data } = await api.post(
				`/admin/business-accounts/${id}/net-terms`,
				body,
			);
			return data.data as AdminBusinessRow;
		},
		onSuccess: () => {
			invalidate(qc);
			qc.invalidateQueries({ queryKey: ["admin", "receivables"] });
		},
	});
}
